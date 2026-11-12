#!/usr/bin/env python3
"""Synthetic normal-runtime test. Requires Python stdlib, Docker, disposable MySQL.

The supplied container must have root access with an empty password. Never supply
an existing application database: this script creates its own fixed-name schema
and deliberately refuses to reuse it. No data, credentials or files are uploaded.
"""
import argparse
import json
import re
import subprocess
import sys

SCHEMA = 'timestamp_synthetic_regression'
MODE = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'


def container_identifier(value):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}', value):
        raise argparse.ArgumentTypeError('Use one conservative Docker container name or hexadecimal ID; flags and whitespace are not accepted.')
    return value


class Probe:
    def __init__(self, container, expected):
        self.container = container_identifier(container)
        self.expected = expected
        self.report = {'status': 'running', 'expected_version': expected, 'checks': [], 'metadata': {}, 'show_create': {}}

    def sql(self, sql, *, database=True, timestamp=1760000000, expect_error=None):
        prefix = f"SET SESSION time_zone='+00:00'; SET SESSION sql_mode='{MODE}'; SET timestamp={timestamp}; "
        command = ['docker', 'exec', '-i', self.container, 'mysql', '--no-defaults', '--protocol=socket', '-uroot', '--batch', '--raw', '--skip-column-names']
        if database:
            command.append(SCHEMA)
        result = subprocess.run(command, input=prefix + sql, text=True, capture_output=True, timeout=45)
        if expect_error is not None:
            if result.returncode == 0 or f'ERROR {expect_error} ' not in result.stderr:
                raise AssertionError(f'Expected MySQL error {expect_error}; exit={result.returncode}; stderr={result.stderr.strip()}')
            return []
        if result.returncode:
            raise RuntimeError(f'MySQL exited {result.returncode}: {result.stderr.strip()}')
        return result.stdout.splitlines()

    def objects(self, sql, **kwargs):
        return [json.loads(line) for line in self.sql(sql, **kwargs)]

    def check(self, name, condition):
        if not condition:
            raise AssertionError(name)
        self.report['checks'].append(name)

    def metadata(self, table, phase):
        row = self.objects(f"""SELECT JSON_OBJECT(
            'table',TABLE_NAME,'column',COLUMN_NAME,'ordinal_position',ORDINAL_POSITION,
            'data_type',DATA_TYPE,'column_type',COLUMN_TYPE,'is_nullable',IS_NULLABLE,
            'column_default',COLUMN_DEFAULT,'default_hex',HEX(COLUMN_DEFAULT),
            'default_sha256',SHA2(COLUMN_DEFAULT,256),'extra',EXTRA,
            'datetime_precision',DATETIME_PRECISION,'generation_expression',GENERATION_EXPRESSION,
            'character_set',CHARACTER_SET_NAME,'collation',COLLATION_NAME,'comment',COLUMN_COMMENT)
            FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='{SCHEMA}'
            AND TABLE_NAME='{table}' AND COLUMN_NAME='createdAt'""")[0]
        self.report['metadata'][phase] = row
        self.report['show_create'][phase] = '\n'.join(self.sql(f'SHOW CREATE TABLE `{table}`;'))
        return row

    def rows(self, table):
        return self.objects(f"SELECT JSON_ARRAY(id,payload,DATE_FORMAT(createdAt,'%Y-%m-%d %H:%i:%s.%f')) FROM `{table}` ORDER BY id")

    def scalar(self, statement, **kwargs):
        lines = self.sql(statement, **kwargs)
        return lines == ['1']

    def run(self):
        runtime = self.objects("SELECT JSON_OBJECT('version',VERSION(),'version_comment',@@version_comment,'sql_mode',@@sql_mode,'time_zone',@@time_zone,'explicit_defaults_for_timestamp',@@explicit_defaults_for_timestamp)", database=False)[0]
        self.report['runtime'] = runtime
        self.check('exact_mysql_version', runtime['version'] == self.expected)
        self.check('explicit_timestamp_defaults_enabled', runtime['explicit_defaults_for_timestamp'] == 1)
        self.check('empty_disposable_server', self.scalar(
            "SELECT COUNT(*)=0 FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME NOT IN ('mysql','sys','information_schema','performance_schema');",
            database=False))
        self.sql(f'CREATE DATABASE `{SCHEMA}`;', database=False)
        self.sql('CREATE TABLE approved_work(id INT PRIMARY KEY,payload INT NOT NULL DEFAULT 0,createdAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP);'
                 "INSERT INTO approved_work(id,createdAt) VALUES(1,'2024-01-02 03:04:05'),(2,'2025-06-07 08:09:10');")
        before = self.rows('approved_work')
        canonical = self.metadata('approved_work', 'nullable_canonical')
        self.check('initial_nullable', canonical['is_nullable'] == 'YES')
        alter = 'ALTER TABLE `approved_work` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT (now());'
        self.sql(alter)
        changed = self.metadata('approved_work', 'notnull_expression')
        self.check('nullable_alter_preserves_rows', self.rows('approved_work') == before)
        allowed_changes = {'is_nullable', 'column_default', 'default_hex', 'default_sha256'}
        self.check('unrelated_metadata_unchanged',
                   {k: v for k, v in canonical.items() if k not in allowed_changes}
                   == {k: v for k, v in changed.items() if k not in allowed_changes})
        self.check('target_nullability_and_precision', changed['is_nullable'] == 'NO' and changed['datetime_precision'] == 0)
        self.check('no_implicit_on_update', 'on update' not in changed['extra'].lower())
        self.sql(alter)
        repeated = self.metadata('approved_work', 'notnull_expression_repeated')
        self.check('repeat_alter_preserves_rows', self.rows('approved_work') == before)
        self.check('repeat_metadata_stable', changed == repeated)
        self.sql('INSERT INTO approved_work(id) VALUES(3);')
        self.check('default_is_current_time', self.scalar('SELECT createdAt=FROM_UNIXTIME(1760000000) FROM approved_work WHERE id=3;'))
        self.sql('UPDATE approved_work SET payload=1 WHERE id=3;', timestamp=1760000060)
        self.check('created_timestamp_not_updated', self.scalar('SELECT createdAt=FROM_UNIXTIME(1760000000) FROM approved_work WHERE id=3;'))
        self.sql('INSERT INTO approved_work(id,createdAt) VALUES(4,NULL);', expect_error=1048)
        self.check('null_insert_rejected_without_row', self.scalar('SELECT COUNT(*)=0 FROM approved_work WHERE id=4;'))
        self.sql('UPDATE approved_work SET createdAt=NULL WHERE id=1;', expect_error=1048)
        self.check('null_update_preserves_value', self.scalar("SELECT createdAt='2024-01-02 03:04:05' FROM approved_work WHERE id=1;"))
        self.report['default_comparison'] = {
            'canonical': canonical['column_default'], 'parenthesized_now': changed['column_default'],
            'equal_bytes': canonical['default_hex'] == changed['default_hex'],
            'interpretation': 'Observation only; string equality is not a success criterion or production diagnosis.'}
        # Preserve both fractional precision and explicit ON UPDATE semantics.
        self.sql('CREATE TABLE precision_control(id INT PRIMARY KEY,payload INT NOT NULL DEFAULT 0,createdAt TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6));'
                 "INSERT INTO precision_control(id,createdAt) VALUES(1,'2024-01-02 03:04:05.123456');")
        precision_rows = self.rows('precision_control')
        self.metadata('precision_control', 'precision_before')
        self.sql('ALTER TABLE precision_control MODIFY COLUMN createdAt TIMESTAMP(6) NOT NULL DEFAULT(now(6)) ON UPDATE CURRENT_TIMESTAMP(6);')
        precision = self.metadata('precision_control', 'precision_after')
        self.check('fractional_row_preserved', self.rows('precision_control') == precision_rows)
        self.check('fractional_metadata_preserved', precision['datetime_precision'] == 6 and 'on update' in precision['extra'].lower())
        self.sql('INSERT INTO precision_control(id) VALUES(2);', timestamp='1760000000.654321')
        self.check('fractional_default_works', self.scalar("SELECT DATE_FORMAT(createdAt,'%Y-%m-%d %H:%i:%s.%f')=DATE_FORMAT(FROM_UNIXTIME(1760000000.654321),'%Y-%m-%d %H:%i:%s.%f') FROM precision_control WHERE id=2;"))
        self.sql('UPDATE precision_control SET payload=1 WHERE id=1;', timestamp='1760000060.654321')
        self.check('explicit_on_update_works', self.scalar("SELECT DATE_FORMAT(createdAt,'%Y-%m-%d %H:%i:%s.%f')=DATE_FORMAT(FROM_UNIXTIME(1760000060.654321),'%Y-%m-%d %H:%i:%s.%f') FROM precision_control WHERE id=1;"))
        self.report['status'] = 'passed'
        self.report['scope'] = 'Synthetic normal-runtime semantics only; not an exact production clone or checkpoint diagnosis.'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--container', required=True, type=container_identifier)
    parser.add_argument('--expected-version', required=True, choices=['9.7.2', '9.7.4'])
    args = parser.parse_args()
    probe = Probe(args.container, args.expected_version)
    try:
        probe.run()
    except (AssertionError, RuntimeError, subprocess.SubprocessError, ValueError, IndexError, KeyError, OSError) as error:
        probe.report.update(status='failed', error=str(error))
    print(json.dumps(probe.report, sort_keys=True, separators=(',', ':')))
    return 0 if probe.report['status'] == 'passed' else 1


if __name__ == '__main__':
    sys.exit(main())

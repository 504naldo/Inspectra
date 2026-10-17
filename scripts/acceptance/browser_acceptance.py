#!/usr/bin/env python3
"""Real Chromium/React acceptance with disposable data and intercepted tRPC HTTP.

Run: python -m pip install playwright==1.62.0
     python -m playwright install --with-deps chromium
     python scripts/acceptance/browser_acceptance.py

The runner starts its own loopback Vite server. Production components, browser
storage, Web Locks and DOM events are real; database/provider responses are mocks.
No live provider, database, service worker or Android coverage is claimed.
"""
import argparse
import asyncio
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from urllib.parse import parse_qs, unquote, urlsplit

from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "tmp/browser-acceptance"
REV_A = "inspection-capture-v1:device:" + "a" * 64
REV_B = "inspection-capture-v1:device:" + "b" * 64
ACTOR_A = {"id": 1, "companyId": 10, "role": "office", "customerOrgId": None,
           "sessionVersion": 0, "name": "Synthetic Account One", "email": "one@example.invalid"}
ACTOR_B = {**ACTOR_A, "id": 2, "companyId": 20, "name": "Synthetic Account Two", "email": "two@example.invalid"}


def success(value):
    return {"result": {"data": {"json": value}}}


def failure(path, message, code="CONFLICT", status=409):
    return {"error": {"json": {"message": message, "code": -32009,
            "data": {"code": code, "httpStatus": status, "path": path}}}}


class MockBackend:
    def __init__(self):
        self.actor = copy.deepcopy(ACTOR_A)
        self.calls = []
        self.accepted = []
        self.receipts = {}
        self.provider_calls = []
        self.block_mutations = False
        self.drop_send_replies = 0
        self.device_revision = REV_A
        self.hold_path = None
        self.hold_started = asyncio.Event()
        self.hold_release = asyncio.Event()
        self.hold_next = False

    def hold(self, path):
        self.hold_path = path
        self.hold_next = True
        self.hold_started = asyncio.Event()
        self.hold_release = asyncio.Event()

    def count(self, path, accepted=False):
        return len([item for item in (self.accepted if accepted else self.calls) if item["path"] == path])

    def query(self, path, payload, actor):
        if path == "auth.me":
            return actor
        if path == "job.getWithDetails":
            return {"id": payload.get("id", 101), "companyId": actor["companyId"], "siteId": 301,
                    "site": {"id": 301, "name": "Synthetic site", "address": "Test address", "city": "Test city"},
                    "customerOrg": {"id": 401, "name": "Synthetic customer"}, "deficiencies": []}
        if path == "fireAlarm.getSystemBySite":
            return {"id": 601, "siteId": 301, "manufacturer": "", "modelNumber": ""}
        if path == "fireAlarm.getJobChecklist":
            return [{"id": item, "questionRevision": "inspection-capture-v1:fire-alarm-question:" + str(item) * 64,
                     "standardVersion": "Synthetic standard", "sectionName": "Synthetic checks", "sectionOrder": 1,
                     "itemLetter": str(item), "itemDescription": f"Synthetic question {item}", "inputType": "checkbox",
                     "numericLabel": None, "numericUnit": None, "isRequired": True, "hasSubItems": False,
                     "subItems": None, "notApplicableNote": None, "headerFields": None, "resultId": None,
                     "result": "not_tested", "numericValue": None, "textValue": None, "notes": None,
                     "fireAlarmSystemId": 601} for item in [1, 2]]
        if path == "fireAlarmForm.getHeader":
            return {"jobId": payload.get("jobId", 101),
                    "systemManufacturer": "" if actor["id"] == 1 else "Account Two manufacturer"}
        if path in ["fireAlarmForm.getAttendanceLog", "fireAlarmForm.getAncillaryCircuits", "activity.listForEntity"]:
            return []
        if path == "company.get":
            return {"id": actor["companyId"], "name": f"Synthetic company {actor['companyId']}"}
        if path == "invoice.get":
            invoice_id = payload["id"]
            return {"id": invoice_id, "companyId": actor["companyId"], "status": "draft",
                    "invoiceNumber": f"TEST-{invoice_id}", "billToName": "Synthetic customer",
                    "billToEmail": f"invoice-{invoice_id}-account-{actor['id']}@example.invalid",
                    "customerOrgId": 401, "siteId": 301, "lineItems": [], "total": "25.00", "subtotal": "25.00",
                    "balanceDue": "25.00", "amountPaid": "0.00", "sageExportStatus": "not_exported"}
        if path == "contact.getRecipientsForWorkflow":
            return {"recommended": [], "fallback": [], "warnings": []}
        if path == "emailDelivery.lookup":
            return self.receipts.get(payload["requestId"])
        if path == "notifications.getUnreadCount":
            return 0
        raise AssertionError(f"Unhandled query {path}: add an explicit synthetic response")

    async def handle(self, route):
        request = route.request
        parsed = urlsplit(request.url)
        paths = unquote(parsed.path.split("/api/trpc/", 1)[1]).split(",")
        batch = parse_qs(parsed.query).get("batch") == ["1"]
        if request.method == "GET":
            raw = json.loads(parse_qs(parsed.query).get("input", ["{}"]) [0])
        else:
            raw = request.post_data_json or {}
        responses = []
        abort = False
        for index, path in enumerate(paths):
            encoded = raw.get(str(index), {}) if batch else raw
            payload = encoded.get("json") if isinstance(encoded, dict) and "json" in encoded else encoded
            payload = payload or {}
            actor = copy.deepcopy(self.actor)
            header = request.headers.get("x-inspectra-expected-account")
            expected = json.loads(header) if header else None
            call = {"path": path, "input": copy.deepcopy(payload), "expectedAccount": expected, "actor": actor["id"]}
            self.calls.append(call)
            if request.method == "GET":
                response = success(self.query(path, payload, actor))
            elif not expected or any(expected.get(key) != actor[key] for key in ["id", "companyId", "role", "customerOrgId", "sessionVersion"]):
                response = failure(path, "Synthetic server rejected changed account", "PRECONDITION_FAILED", 412)
            elif self.block_mutations:
                abort = True
                response = failure(path, "Synthetic connection failure")
            elif path == "invoice.send":
                request_id = payload["requestId"]
                previous = self.receipts.get(request_id)
                if previous is None:
                    self.provider_calls.append(copy.deepcopy(payload))
                    self.receipts[request_id] = {"requestId": request_id, "status": "accepted", "providerMessageId": "mock-provider-id"}
                self.accepted.append(call)
                response = success({"acceptance": "accepted"})
                if self.drop_send_replies:
                    self.drop_send_replies -= 1
                    abort = True
            elif path == "device.technicianUpdate" and payload.get("expectedDeviceRevision") != self.device_revision:
                response = failure(path, "The device definition changed; reload before saving")
            elif path == "device.technicianUpdate":
                self.device_revision = REV_B
                self.accepted.append(call)
                response = success({"success": True, "deviceRevision": self.device_revision})
            elif path in ["fireAlarmForm.upsertHeader", "fireAlarm.saveInspectionResult", "inspectionResult.upsert"]:
                self.accepted.append(call)
                response = success({"success": True})
            else:
                raise AssertionError(f"Unhandled mutation {path}")
            if self.hold_next and path == self.hold_path:
                self.hold_next = False
                self.hold_started.set()
                await asyncio.wait_for(self.hold_release.wait(), 15)
            responses.append(response)
        if abort:
            await route.abort("connectionreset")
        else:
            await route.fulfill(status=200, content_type="application/json", body=json.dumps(responses if batch else responses[0]))


async def input_for(page, label):
    return page.get_by_text(label, exact=True).locator("..").locator("input")


async def wait_until(predicate, timeout=8):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        await asyncio.sleep(0.04)
    raise AssertionError("Condition did not become true before the acceptance deadline")


async def open_page(context, base, mode="fire", **parameters):
    page = await context.new_page()
    query = "&".join([f"mode={mode}"] + [f"{key}={value}" for key, value in parameters.items()])
    await page.goto(f"{base}/?{query}")
    await expect(page.get_by_test_id("identity")).to_have_text("1:10:0")
    if mode == "fire":
        await expect(page.get_by_text("Fire Alarm System Verification — Cover Page", exact=True)).to_be_visible()
    elif mode == "invoice":
        await expect(page.get_by_role("heading", name=f"TEST-{parameters.get('invoice', 501)}", exact=True)).to_be_visible()
    return page


async def invoice_dialog(page):
    await page.get_by_role("button", name="Invoice Email", exact=True).click()
    dialog = page.get_by_role("dialog")
    await expect(dialog.get_by_role("heading", name="Send Invoice to Customer")).to_be_visible()
    await expect(dialog.get_by_text("Checking saved email…", exact=True)).to_have_count(0)
    return dialog


async def offline_interruption(context, backend, base):
    page = await open_page(context, base)
    await context.set_offline(True)
    manufacturer = await input_for(page, "Manufacturer")
    await manufacturer.fill("Captured before interruption")
    assert await page.evaluate("window.__acceptance.pendingDraftCount()") == 1
    # Kill the document before its 1500 ms debounce can dispatch.
    await page.close()
    assert backend.count("fireAlarmForm.upsertHeader") == 0
    backend.block_mutations = True
    await context.set_offline(False)
    restored = await open_page(context, base)
    await expect(await input_for(restored, "Manufacturer")).to_have_value("Captured before interruption")
    await wait_until(lambda: backend.count("fireAlarmForm.upsertHeader") > 0)
    await expect(restored.get_by_role("alert")).to_be_visible()
    assert await restored.evaluate("window.__acceptance.pendingDraftCount()") == 1
    backend.block_mutations = False
    await restored.evaluate("window.dispatchEvent(new Event('online'))")
    await restored.wait_for_function("window.__acceptance.pendingDraftCount() === 0")
    writes = [call for call in backend.accepted if call["path"] == "fireAlarmForm.upsertHeader"]
    assert len(writes) == 1 and writes[0]["input"]["jobId"] == 101
    assert writes[0]["input"]["systemManufacturer"] == "Captured before interruption"


async def cross_account_late_query(context, backend, base):
    page = await open_page(context, base)
    backend.hold("fireAlarmForm.getHeader")
    await page.evaluate("void window.__acceptance.refreshHeader()")
    await asyncio.wait_for(backend.hold_started.wait(), 8)
    await context.set_offline(True)
    await (await input_for(page, "Manufacturer")).fill("Account One private draft")
    backend.actor = copy.deepcopy(ACTOR_B)
    await context.set_offline(False)
    await page.evaluate("window.__acceptance.refreshAuth()")
    await expect(page.get_by_test_id("identity")).to_have_text("2:20:0")
    await expect(await input_for(page, "Manufacturer")).to_have_value("Account Two manufacturer")
    backend.hold_release.set()
    await asyncio.sleep(0.15)
    await expect(await input_for(page, "Manufacturer")).to_have_value("Account Two manufacturer")
    assert await page.evaluate("window.__acceptance.pendingDraftCount()") == 0
    assert await page.evaluate("Object.keys(localStorage).some(k => k.startsWith('inspectra_fire_alarm_drafts:1:10:101:journal:'))")
    # Any old request dispatched on reconnect must carry its original actor; the
    # mock server refuses it after the cookie/account change.
    assert not [call for call in backend.accepted if call["path"] == "fireAlarmForm.upsertHeader" and call["actor"] == 2]


async def quota_fail_closed(context, backend, base):
    page = await open_page(context, base)
    await page.evaluate("""() => {
      window.__setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith('inspectra_fire_alarm_drafts:')) throw new DOMException('Synthetic quota exhausted', 'QuotaExceededError');
        return window.__setItem.call(this, key, value);
      };
    }""")
    await (await input_for(page, "Manufacturer")).fill("Unpersisted correction")
    await expect(page.get_by_role("alert")).to_contain_text("Saved data is preserved")
    await asyncio.sleep(1.7)
    assert backend.count("fireAlarmForm.upsertHeader") == 0
    assert await page.evaluate("window.__acceptance.pendingDraftCount()") == 0
    await expect(await input_for(page, "Manufacturer")).to_have_value("Unpersisted correction")
    await page.evaluate("Storage.prototype.setItem = window.__setItem")


async def delivery_loss_reload(context, backend, base):
    backend.drop_send_replies = 1
    page = await open_page(context, base, "invoice")
    dialog = await invoice_dialog(page)
    await dialog.get_by_role("button", name="Send to 1 recipient", exact=True).click()
    await expect(dialog.get_by_text("An email send is saved for recovery", exact=True)).to_be_visible()
    await expect(dialog.get_by_role("alert")).to_be_visible()
    assert len(backend.provider_calls) == 1
    original = copy.deepcopy(backend.provider_calls[0])
    # Real IndexedDB persists the operation when the document disappears.
    await page.close()
    restored = await open_page(context, base, "invoice")
    recovered = await invoice_dialog(restored)
    await expect(recovered.get_by_text("An email send is saved for recovery", exact=True)).to_be_visible()
    assert backend.count("invoice.send") == 1  # restore never sends automatically
    await recovered.get_by_role("button", name="Check email status", exact=True).click()
    await expect(recovered.get_by_text("Email provider accepted this email", exact=True)).to_be_visible()
    assert len(backend.provider_calls) == 1
    retries = [call["input"] for call in backend.accepted if call["path"] == "invoice.send"]
    assert retries == [original, original]
    before = backend.count("emailDelivery.lookup")
    await recovered.get_by_role("button", name="Start another email", exact=True).click()
    await expect(recovered.get_by_role("button", name="Send to 1 recipient", exact=True)).to_be_visible()
    assert backend.count("emailDelivery.lookup") == before + 1
    assert len(backend.provider_calls) == 1


async def delivery_cross_tab(context, backend, base):
    first = await open_page(context, base, "invoice")
    second = await open_page(context, base, "invoice")
    first_dialog, second_dialog = await invoice_dialog(first), await invoice_dialog(second)
    backend.hold("invoice.send")
    await first_dialog.get_by_role("button", name="Send to 1 recipient", exact=True).click()
    await asyncio.wait_for(backend.hold_started.wait(), 8)
    await second_dialog.get_by_role("button", name="Send to 1 recipient", exact=True).click()
    await second_dialog.get_by_role("button", name="Cancel", exact=True).click()
    await second.get_by_role("button", name="Invoice Email", exact=True).click()
    reopened = second.get_by_role("dialog")
    await expect(reopened.get_by_role("heading", name="Send Invoice to Customer")).to_be_visible()
    backend.hold_release.set()
    await expect(first_dialog.get_by_text("Email provider accepted this email", exact=True)).to_be_visible()
    await expect(reopened.get_by_text("Email provider accepted this email", exact=True)).to_be_visible()
    assert backend.count("invoice.send") == 1 and len(backend.provider_calls) == 1


async def delivery_entity_recipient_reset(context, backend, base):
    page = await open_page(context, base, "invoice")
    dialog = await invoice_dialog(page)
    await dialog.get_by_placeholder("extra@example.com").fill("old-extra@example.invalid")
    await page.evaluate("window.__acceptance.setInvoiceId(502)")
    await expect(page.get_by_role("heading", name="TEST-502", exact=True)).to_be_visible()
    await expect(dialog.get_by_placeholder("extra@example.com")).to_have_value("")
    await expect(dialog.get_by_text("invoice-502-account-1@example.invalid", exact=True)).to_be_visible()
    await expect(dialog.get_by_text("invoice-501-account-1@example.invalid", exact=True)).to_have_count(0)
    assert backend.count("invoice.send") == 0
    await dialog.get_by_role("button", name="Send to 1 recipient", exact=True).click()
    await expect(dialog.get_by_text("Email provider accepted this email", exact=True)).to_be_visible()
    assert backend.provider_calls[0]["id"] == 502
    assert backend.provider_calls[0]["to"] == ["invoice-502-account-1@example.invalid"]


async def smoke_focus_revision(context, backend, base):
    page = await open_page(context, base, "smoke")
    await page.get_by_role("button").filter(has_text="Original suite").click()
    suite = await input_for(page, "Suite #")
    await suite.fill("My focused correction")
    backend.device_revision = REV_B
    await page.evaluate("""revision => window.__acceptance.setDevices([{id:201, deviceRevision:revision,
      deviceType:'SA-I',suiteNumber:'Other actor suite',location:'Original location',result:'not_tested'}])""", REV_B)
    await expect(suite).to_have_value("My focused correction")
    await suite.press("Tab")
    await wait_until(lambda: backend.count("device.technicianUpdate") == 1)
    sent = next(call for call in backend.calls if call["path"] == "device.technicianUpdate")
    assert sent["input"]["expectedDeviceRevision"] == REV_A
    await expect(suite).to_have_value("Other actor suite")
    assert backend.count("device.technicianUpdate", accepted=True) == 0
    await expect(page.get_by_text("My focused correction", exact=True)).to_have_count(0)


async def individual_all_pass_barrier(context, backend, base):
    page = await open_page(context, base, "individual")
    await page.evaluate("""revision => window.__acceptance.setDevices([
      {id:201,deviceRevision:revision,deviceType:'Smoke Detector',location:'First device'},
      {id:202,deviceRevision:revision,deviceType:'Smoke Detector',location:'Second device'}])""", REV_A)
    await page.get_by_role("button", name="All Pass", exact=True).click()
    backend.hold("inspectionResult.upsert")
    await page.get_by_role("button", name="Save", exact=True).click()
    await asyncio.wait_for(backend.hold_started.wait(), 8)
    await expect(page.get_by_role("button", name="All Pass", exact=True)).to_be_disabled()
    await expect(page.get_by_role("button", name="Save", exact=True)).to_be_disabled()
    # A synthetic click on the rendered disabled control must not dispatch a
    # second save. The separate gridWriteSafety suite covers the pre-render lock.
    await page.get_by_role("button", name="Save", exact=True).dispatch_event("click")
    assert backend.count("inspectionResult.upsert") == 1
    backend.hold_release.set()
    await wait_until(lambda: backend.count("inspectionResult.upsert") == 2)
    await expect(page.get_by_role("button", name="Save", exact=True)).to_be_disabled()
    results = [call["input"] for call in backend.accepted if call["path"] == "inspectionResult.upsert"]
    assert sorted(item["deviceId"] for item in results) == [201, 202]
    assert all(item["expectedDeviceRevision"] == REV_A and item["result"] == "pass" for item in results)


SCENARIOS = [offline_interruption, cross_account_late_query, quota_fail_closed,
             delivery_loss_reload, delivery_cross_tab, delivery_entity_recipient_reset,
             smoke_focus_revision, individual_all_pass_barrier]


async def run(args):
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    port = args.port
    base = f"http://127.0.0.1:{port}"
    # Vite has no backend credentials. HTTP mocks are installed before navigation.
    server_log = (ARTIFACTS / "server.log").open("w")
    server = await asyncio.create_subprocess_exec(shutil.which("node") or "node", "scripts/acceptance/browserServer.mjs",
              cwd=ROOT, env={"PATH": os.environ.get("PATH", ""), "INSPECTRA_ACCEPTANCE_PORT": str(port)},
              stdout=server_log, stderr=subprocess.STDOUT)
    results = []
    infrastructure_error = None
    try:
        ready = False
        for _ in range(120):
            if server.returncode is not None:
                raise RuntimeError(f"Acceptance server exited; see {ARTIFACTS / 'server.log'}")
            try:
                reader, writer = await asyncio.wait_for(asyncio.open_connection("127.0.0.1", port), 0.5)
                writer.close()
                await writer.wait_closed()
                ready = True
                break
            except Exception:
                await asyncio.sleep(0.1)
        if not ready:
            raise RuntimeError(f"Acceptance server did not bind; see {ARTIFACTS / 'server.log'}")
        async with async_playwright() as playwright:
            options = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
            if args.browser_executable:
                options["executable_path"] = args.browser_executable
            browser = await playwright.chromium.launch(**options)
            for scenario in SCENARIOS:
                mobile = scenario is smoke_focus_revision
                context = await browser.new_context(viewport={"width": 390 if mobile else 1440, "height": 900},
                                                    is_mobile=mobile, has_touch=mobile, service_workers="block")
                await context.tracing.start(screenshots=True, snapshots=True, sources=True)
                backend = MockBackend()
                errors = []
                context.on("page", lambda page: page.on("pageerror", lambda error: errors.append(str(error))))
                await context.route("**/api/trpc/**", backend.handle)
                await context.route("https://**", lambda route: route.abort("blockedbyclient"))
                started = time.monotonic()
                try:
                    await scenario(context, backend, base)
                    assert not errors, f"Uncaught browser errors: {errors}"
                    result = {"scenario": scenario.__name__, "status": "passed", "seconds": round(time.monotonic()-started, 2)}
                    print(f"PASS {scenario.__name__}", flush=True)
                except Exception as error:
                    result = {"scenario": scenario.__name__, "status": "failed", "error": str(error), "browserErrors": errors}
                    for index, page in enumerate(context.pages):
                        await page.screenshot(path=str(ARTIFACTS / f"{scenario.__name__}-{index}.png"), full_page=True)
                    print(f"FAIL {scenario.__name__}: {error}", flush=True)
                finally:
                    backend.hold_release.set()
                    await context.tracing.stop(path=str(ARTIFACTS / f"{scenario.__name__}.zip"))
                    (ARTIFACTS / f"{scenario.__name__}-http.json").write_text(json.dumps(backend.calls, indent=2))
                    await context.close()
                results.append(result)
            await browser.close()
    except Exception as error:
        infrastructure_error = str(error)
        raise
    finally:
        (ARTIFACTS / "results.json").write_text(json.dumps({"coverage": "real components/browser; synthetic HTTP/provider; no service-worker/native/live acceptance", "infrastructureError": infrastructure_error, "results": results}, indent=2))
        if server.returncode is None:
            server.terminate()
            await server.wait()
        server_log.close()
    if len(results) != len(SCENARIOS) or any(result["status"] != "passed" for result in results):
        raise SystemExit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4399)
    parser.add_argument("--browser-executable", default=None)
    asyncio.run(run(parser.parse_args()))

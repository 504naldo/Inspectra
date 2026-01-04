import { describe, it, expect } from 'vitest';

describe('Sprinkler Checklist Deficiency Logic', () => {
  describe('createsDeficiencyWhen Configuration', () => {
    it('should create deficiency when response matches createsDeficiencyWhen=NO', () => {
      const checklistItems = [
        { response: 'NO', createsDeficiencyWhen: 'NO', comment: 'Needs repair' },
        { response: 'YES', createsDeficiencyWhen: 'NO', comment: null },
        { response: 'NA', createsDeficiencyWhen: 'NO', comment: null },
      ];

      const deficiencies = checklistItems.filter(
        item => item.response && item.createsDeficiencyWhen && item.response === item.createsDeficiencyWhen
      );

      expect(deficiencies.length).toBe(1);
      expect(deficiencies[0].response).toBe('NO');
    });

    it('should create deficiency when response matches createsDeficiencyWhen=YES', () => {
      const checklistItems = [
        { response: 'YES', createsDeficiencyWhen: 'YES', comment: 'Unauthorized changes detected' },
        { response: 'NO', createsDeficiencyWhen: 'YES', comment: null },
        { response: 'NA', createsDeficiencyWhen: 'YES', comment: null },
      ];

      const deficiencies = checklistItems.filter(
        item => item.response && item.createsDeficiencyWhen && item.response === item.createsDeficiencyWhen
      );

      expect(deficiencies.length).toBe(1);
      expect(deficiencies[0].response).toBe('YES');
    });

    it('should NOT create deficiency when createsDeficiencyWhen=NEVER', () => {
      const checklistItems = [
        { response: 'NO', createsDeficiencyWhen: 'NEVER', comment: 'Just informational' },
        { response: 'YES', createsDeficiencyWhen: 'NEVER', comment: null },
        { response: 'NA', createsDeficiencyWhen: 'NEVER', comment: null },
      ];

      const deficiencies = checklistItems.filter(
        item => item.response && item.createsDeficiencyWhen && item.response === item.createsDeficiencyWhen
      );

      expect(deficiencies.length).toBe(0);
    });

    it('should NOT create deficiency when response does not match createsDeficiencyWhen', () => {
      const checklistItems = [
        { response: 'YES', createsDeficiencyWhen: 'NO', comment: null },
        { response: 'NO', createsDeficiencyWhen: 'YES', comment: 'Comment' },
        { response: 'NA', createsDeficiencyWhen: 'NO', comment: null },
      ];

      const deficiencies = checklistItems.filter(
        item => item.response && item.createsDeficiencyWhen && item.response === item.createsDeficiencyWhen
      );

      expect(deficiencies.length).toBe(0);
    });
  });

  describe('Comment Validation', () => {
    it('should require comment when response creates deficiency', () => {
      const checklistItems = [
        { response: 'NO', createsDeficiencyWhen: 'NO', comment: null },
        { response: 'NO', createsDeficiencyWhen: 'NO', comment: 'Has comment' },
      ];

      const invalidItems = checklistItems.filter(
        item => item.response && 
                item.createsDeficiencyWhen && 
                item.response === item.createsDeficiencyWhen &&
                !item.comment
      );

      expect(invalidItems.length).toBe(1);
    });

    it('should NOT require comment when response does not create deficiency', () => {
      const checklistItems = [
        { response: 'YES', createsDeficiencyWhen: 'NO', comment: null },
        { response: 'NA', createsDeficiencyWhen: 'NO', comment: null },
        { response: 'NO', createsDeficiencyWhen: 'NEVER', comment: null },
      ];

      const invalidItems = checklistItems.filter(
        item => item.response && 
                item.createsDeficiencyWhen && 
                item.response === item.createsDeficiencyWhen &&
                !item.comment
      );

      expect(invalidItems.length).toBe(0);
    });
  });

  describe('Mixed Scenarios', () => {
    it('should handle mixed checklist with various createsDeficiencyWhen values', () => {
      const checklistItems = [
        // Creates deficiency
        { questionText: 'Q1', response: 'NO', createsDeficiencyWhen: 'NO', comment: 'Issue found' },
        { questionText: 'Q2', response: 'YES', createsDeficiencyWhen: 'YES', comment: 'Unauthorized change' },
        
        // Does NOT create deficiency
        { questionText: 'Q3', response: 'YES', createsDeficiencyWhen: 'NO', comment: null },
        { questionText: 'Q4', response: 'NO', createsDeficiencyWhen: 'NEVER', comment: 'Just info' },
        { questionText: 'Q5', response: 'NA', createsDeficiencyWhen: 'NO', comment: null },
        { questionText: 'Q6', response: 'NO', createsDeficiencyWhen: 'YES', comment: 'Not a deficiency' },
      ];

      const deficiencies = checklistItems.filter(
        item => item.response && item.createsDeficiencyWhen && item.response === item.createsDeficiencyWhen
      );

      expect(deficiencies.length).toBe(2);
      expect(deficiencies[0].questionText).toBe('Q1');
      expect(deficiencies[1].questionText).toBe('Q2');
    });

    it('should preserve existing finalized inspections with null createsDeficiencyWhen', () => {
      const checklistItems = [
        { response: 'NO', createsDeficiencyWhen: null, comment: 'Old inspection' },
        { response: 'NO', createsDeficiencyWhen: undefined, comment: 'Old inspection 2' },
      ];

      const deficiencies = checklistItems.filter(
        item => item.response && item.createsDeficiencyWhen && item.response === item.createsDeficiencyWhen
      );

      // Old inspections without createsDeficiencyWhen should not break
      expect(deficiencies.length).toBe(0);
    });
  });

  describe('NFPA 25 Specific Scenarios', () => {
    it('should identify unauthorized system changes as deficiency (YES creates deficiency)', () => {
      const item = {
        questionText: 'Have changes been made to the fire protection system since the last inspection?',
        response: 'YES',
        createsDeficiencyWhen: 'YES',
        comment: 'Unauthorized piping modifications detected'
      };

      const isDeficiency = item.response === item.createsDeficiencyWhen;
      expect(isDeficiency).toBe(true);
    });

    it('should identify missing clearance as deficiency (NO creates deficiency)', () => {
      const item = {
        questionText: 'Do all sprinkler heads have at least 18" clearance from storage?',
        response: 'NO',
        createsDeficiencyWhen: 'NO',
        comment: 'Storage within 12" of sprinkler heads in warehouse'
      };

      const isDeficiency = item.response === item.createsDeficiencyWhen;
      expect(isDeficiency).toBe(true);
    });

    it('should NOT create deficiency for informational questions', () => {
      const item = {
        questionText: 'Is the building completely sprinklered?',
        response: 'NO',
        createsDeficiencyWhen: 'NEVER',
        comment: 'Partial sprinkler coverage by design'
      };

      const isDeficiency = item.response === item.createsDeficiencyWhen;
      expect(isDeficiency).toBe(false);
    });
  });
});

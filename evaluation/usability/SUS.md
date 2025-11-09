### System Usability Scale (SUS) — Face-based Checkout with PIN & Email Recovery

This SUS measures overall usability of the end-to-end system that enables:

- Face-based identification and checkout with a 6‑digit PIN proof
- On-chain token transfer via delegation
- Email-based account recovery (linking + DKIM verification → PIN reset)

Administer SUS after participants attempt the three workflows below.

---

### Participant Instructions

1. Complete these workflows without external help:
   - Onboarding: face capture → set 6‑digit PIN → complete registration
   - Payment: identify with face → enter PIN → send payment
   - Recovery: link email → complete DKIM/verification → reset PIN
2. For each statement, select one choice from 1 to 5:
   - 1 = Strongly Disagree
   - 2 = Disagree
   - 3 = Neutral
   - 4 = Agree
   - 5 = Strongly Agree
3. Answer based on your overall experience with the system across these workflows (not just one screen).

---

### SUS Statements (rate 1–5)

1. I think that I would like to use this system frequently.
2. I found the system unnecessarily complex.
3. I thought the system was easy to use.
4. I think that I would need the support of a technical person to be able to use this system.
5. I found the various functions in this system were well integrated.
6. I thought there was too much inconsistency in this system.
7. I would imagine that most people would learn to use this system very quickly.
8. I found the system very cumbersome to use.
9. I felt very confident using the system.
10. I needed to learn a lot of things before I could get going with this system.

Notes:

- “System” includes onboarding, face identification, PIN entry/proof, payment confirmation, and email/DKIM-based recovery.
- Consider clarity of messages like “Identifying face…”, “Generating proof…”, PIN rules, error handling (e.g., incorrect PIN), and transaction/verification feedback.

---

### Scoring (for researchers)

- For odd-numbered items (1,3,5,7,9): contribution = response − 1
- For even-numbered items (2,4,6,8,10): contribution = 5 − response
- Sum all contributions (range 0–40) and multiply by 2.5 to get SUS (0–100)

Example:

- Responses: [4,2,4,2,4,2,4,2,4,2]
- Contributions: [3,3,3,3,3,3,3,3,3,3] → Sum 30 → SUS 75.0

Target thresholds (project goals):

- Mean satisfaction ≥ 4/5 and SUS ≥ 70

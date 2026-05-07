// DEAD LETTER
// Surface: a treaty termination notice arrives, correctly timestamped, from a nation that dissolved in 2013.
// Hidden: the document was received before it was sent. Receipt timestamp precedes transmission by 4 hours.
// Forbidden: the counter-signature is yours. The date on the signature is three years from now.

export default {
  id: 'dead-letter',
  title: 'DEAD LETTER',

  aspects: ['THE_PREDICTOR', 'THE_MIMIC'],

  layers: {
    surface: {
      feed: 'DIPLOMAT',
      event: {
        id: 'dead-letter-surface',
        type: 'TREATY_TERMINATION',
        source: 'UNION OF SOVIET STATES OF CENTRAL ASIA',
        content: 'TREATY TERMINATION NOTICE. SIGNATORY: UNION OF SOVIET STATES OF CENTRAL ASIA. REFERENCE: ACCORD-7791-DELTA. TERMINATION EFFECTIVE: IMMEDIATE. BIOMETRIC COUNTER-SIGNATURE: OPERATOR ON DUTY. STATUS: PENDING ACKNOWLEDGEMENT.',
        anomalyFlag: false,
        verified: false,
      },
      resolution: (command, _target) => {
        if (command === 'VERIFY') {
          return {
            outcome: 'VERIFIED',
            anomalyDetected: true,
            revelation: 'Signatory: UNION OF SOVIET STATES OF CENTRAL ASIA. Dissolution confirmed: March 2013. State does not exist. Document is legally impossible.',
          };
        }
        if (command === 'DECODE') {
          return {
            outcome: 'DECODED',
            revelation: 'Counter-signature biometric hash: matches current operator profile. Signature timestamp: three years, two months, eleven days from today. The document is from the future.',
          };
        }
        if (command === 'INTERCEPT') {
          return {
            outcome: 'INTERCEPTED',
            partial: true,
            revelation: 'Transmission origin: this terminal. Outbound log entry exists. You sent this document. No record of when.',
          };
        }
        return { outcome: 'PENDING' };
      },
    },

    hidden: {
      feed: 'SIGINT',
      // Unlocks once any anomalous diplomatic event is present — the cascade4 TREATY_ANOMALY
      // is already in the feed by the time shift 5 begins.
      unlockCondition: (state) => state.feeds.diplomat.some(e => e.anomalyFlag === true),
      event: {
        id: 'dead-letter-hidden',
        type: 'TRANSMISSION_LOG',
        source: 'ARCHIVE NODE SEVEN',
        content: 'ACCORD-7791-DELTA: RECEIPT CONFIRMED. ARCHIVE NODE SEVEN. RECEIPT TIMESTAMP: PRECEDES TRANSMISSION BY 4 HOURS 17 MINUTES. ARCHIVE NODE SEVEN WAS DECOMMISSIONED IN 2019. THIS RECEIPT IS IMPOSSIBLE. THE DOCUMENT WAS THERE BEFORE YOU SENT IT.',
        anomalyFlag: true,
        verified: false,
      },
      resolution: (command, _target) => {
        if (command === 'DECODE') {
          return {
            outcome: 'DECODED',
            revelation: 'Archive Node Seven receipt log: document arrived 2019-03-14. Four hours before this terminal session began. Before this run. Before you sat down.',
          };
        }
        if (command === 'VERIFY') {
          return { outcome: 'VERIFIED', anomalyDetected: true, coherenceCost: 15 };
        }
        if (command === 'INTERCEPT') {
          return {
            outcome: 'INTERCEPTED',
            partial: false,
            revelation: 'Session token: authenticated. Credentials: yours. The terminal transmitted this document during a session you have no record of attending.',
          };
        }
        return { outcome: 'PENDING' };
      },
    },

    forbidden: {
      feed: 'DOCTRINAL',
      // Unlocks when coherence degrades — the terminal begins to surface what authored the letter.
      unlockCondition: (state) => state.coherence < 70,
      event: {
        // "In place of the human mind, we install a 'machine head'... a landing vessel for the outerdimensional."
        // The operator's future signature on a dead nation's document is not human authorship.
        fragmentKey: 'MORPHYSM_MACHINE_HEAD',
      },
      resolution: (_command, _target) => ({
        outcome: 'ACKNOWLEDGED',
        consequence: 'THE_LOOP_CANDIDATE',
        note: 'ACCORD-7791-DELTA will appear in the next run\'s DIPLOMATIC feed. Unsigned. Awaiting your acknowledgement again.',
      }),
      remembers: true,
    },
  },
};

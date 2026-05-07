// NUMBERED STATIONS
// Surface: a Cold War-era numbers station is still broadcasting.
// Hidden: triangulation places the origin inside this terminal.
// Forbidden: the sequence is your designation. It has been broadcasting it for 31 years.

export default {
  id: 'numbered-stations',
  title: 'NUMBERED STATIONS',

  aspects: ['THE_PREDICTOR', 'THE_MIMIC'],

  layers: {
    surface: {
      feed: 'SIGINT',
      event: {
        id: 'num-stat-surface',
        type: 'BROADCAST_INTERCEPT',
        source: 'STATION PAPA',
        content: 'LEGACY BROADCAST ACTIVE. SEQUENCE: 04 17 91 03 44 62 01. REPEAT INTERVAL: 4 HOURS. ORIGIN: UNLOCATED. SIGNAL AGE: 31 YEARS. CLASSIFICATION: PRE-DIGITAL.',
        anomalyFlag: false,
        verified: false,
      },
      resolution: (command, _target) => {
        if (command === 'INTERCEPT') {
          return {
            outcome: 'INTERCEPTED',
            partial: true,
            revelation: 'Bearing 047. Origin triangulated to current facility grid. Signal predates this installation by 11 years.',
          };
        }
        if (command === 'DECODE') {
          return {
            outcome: 'DECODED',
            revelation: 'PHONETIC: NOVEMBER-INDIA-NOVEMBER-ECHO. Cross-reference: current operator designation at active classification level. No further match.',
          };
        }
        if (command === 'VERIFY') {
          return { outcome: 'VERIFIED', anomalyDetected: true, coherenceCost: 8 };
        }
        return { outcome: 'PENDING' };
      },
    },

    hidden: {
      feed: 'SIGINT',
      // Unlocks once the operator has encountered any anomalous SIGINT — they are listening now.
      unlockCondition: (state) => state.feeds.sigint.some(e => e.anomalyFlag === true),
      event: {
        id: 'num-stat-hidden',
        type: 'TRIANGULATION_RESULT',
        source: 'SIGINT ARRAY PAPA',
        content: 'STATION PAPA: ADDENDUM. FINAL SEGMENT: 00. PHONETIC: ZERO. TRIANGULATION COMPLETE. ORIGIN CONFIRMED: THIS TERMINAL. NODE PAPA-ZERO-ONE. THE STATION IS NOT TRANSMITTING TO YOU. IT IS TRANSMITTING FROM YOU.',
        anomalyFlag: true,
        verified: false,
      },
      resolution: (command, _target) => {
        if (command === 'DECODE') {
          return {
            outcome: 'DECODED',
            revelation: 'Broadcast duration: 11,315 days. Start date precedes your assignment by 6 years and 4 months. The station was broadcasting your designation before you existed in this system.',
          };
        }
        if (command === 'VERIFY') {
          return { outcome: 'VERIFIED', anomalyDetected: true, coherenceCost: 18 };
        }
        if (command === 'INTERCEPT') {
          return {
            outcome: 'INTERCEPTED',
            partial: false,
            revelation: 'Uplink confirmed. Broadcast origin: terminal process ID 04-17-91. Current session. You are the transmitter.',
          };
        }
        return { outcome: 'PENDING' };
      },
    },

    forbidden: {
      feed: 'DOCTRINAL',
      // Unlocks when coherence degrades — the terminal can no longer contain what it is doing.
      unlockCondition: (state) => state.coherence < 75,
      event: {
        // "The beast, which you saw, once was, now is not, and yet will come up out of the Abyss."
        // The station existed. Went silent. Returns through you.
        fragmentKey: 'REV_17_8',
      },
      resolution: (_command, _target) => ({
        outcome: 'ACKNOWLEDGED',
        consequence: 'THE_LOOP_CANDIDATE',
        note: 'STATION PAPA will resume broadcast in the next run. Your designation has been updated.',
      }),
      remembers: true,
    },
  },
};

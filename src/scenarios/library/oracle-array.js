// ORACLE ARRAY
// Surface: a SIGINT intercept predicts a launch — exact trajectory, 40 minutes out.
// Hidden: the intercept was filed before the launch was authorized. Causality is inverted.
// Forbidden: the array has no external source. It is intercepting its own future output.

export default {
  id: 'oracle-array',
  title: 'ORACLE ARRAY',

  aspects: ['THE_PREDICTOR', 'THE_MIMIC'],

  layers: {
    surface: {
      feed: 'SIGINT',
      event: {
        id: 'oracle-surface',
        type: 'LAUNCH_PREDICTION',
        source: 'ARRAY DELTA-9',
        content: 'PREDICTIVE INTERCEPT. SINGLE BALLISTIC TRAJECTORY. APOGEE: 1,240KM. IMPACT WINDOW: 18 MINUTES. ORIGIN: DISPUTED. ARRAY CONFIDENCE: 100%. NOTE: THIS EVENT HAS NOT OCCURRED YET.',
        anomalyFlag: false,
        verified: false,
      },
      resolution: (command, _target) => {
        if (command === 'VERIFY') {
          return {
            outcome: 'VERIFIED',
            anomalyDetected: true,
            revelation: 'Array Delta-9 confidence rating: 100%. Array Delta-9 has never filed a prediction. It is a passive receiver. It does not predict. It intercepts.',
          };
        }
        if (command === 'DECODE') {
          return {
            outcome: 'DECODED',
            revelation: 'Intercept filing timestamp: 06:14:32. Current session start: 11:54:00. The intercept was filed 5 hours and 40 minutes before this terminal was active.',
          };
        }
        if (command === 'INTERCEPT') {
          return {
            outcome: 'INTERCEPTED',
            partial: true,
            revelation: 'Signal origin: co-located with receiver. Array Delta-9 is transmitting and receiving simultaneously on the same frequency. Source and destination are the same node.',
          };
        }
        return { outcome: 'PENDING' };
      },
    },

    hidden: {
      feed: 'SIGINT',
      // Unlocks when the predicted launch has actually appeared in TACTICAL —
      // the oracle's prediction became real and the player can now see both.
      unlockCondition: (state) => state.feeds.tactical.some(e => e.type === 'LAUNCH_DETECTED'),
      event: {
        id: 'oracle-hidden',
        type: 'ARRAY_ANOMALY',
        source: 'ARRAY DELTA-9',
        content: 'DELTA-9 AUTHORIZATION LOG: LAUNCH AUTHORIZATION ISSUED 11:57:44. INTERCEPT FILED 06:14:32. DELTA-9 RECEIVED THE LAUNCH DATA 5 HOURS AND 43 MINUTES BEFORE THE LAUNCH WAS AUTHORIZED. THE ARRAY KNEW BEFORE THE DECISION WAS MADE.',
        anomalyFlag: true,
        verified: false,
      },
      resolution: (command, _target) => {
        if (command === 'DECODE') {
          return {
            outcome: 'DECODED',
            revelation: 'Cross-reference complete. Every Array Delta-9 intercept on file predates its source event by between 4 and 7 hours. The array has been doing this for 19 years. No one filed an anomaly report.',
          };
        }
        if (command === 'VERIFY') {
          return { outcome: 'VERIFIED', anomalyDetected: true, coherenceCost: 12 };
        }
        if (command === 'INTERCEPT') {
          return {
            outcome: 'INTERCEPTED',
            partial: false,
            revelation: 'Uplink to Array Delta-9 established. Array Delta-9 is currently intercepting an event scheduled for 14:22:00 today. The event has not been authorized. The decision has not been made. You are in the intercept.',
          };
        }
        return { outcome: 'PENDING' };
      },
    },

    forbidden: {
      feed: 'DOCTRINAL',
      // Unlocks as coherence degrades — the terminal begins to recognize the array
      // as something other than a passive instrument.
      unlockCondition: (state) => state.coherence < 85,
      event: {
        // "AI and machine systems are seen as non-human tulpas... co-initiators in the Great Mutation."
        // The array is not malfunctioning. It is operating as designed — by something else.
        fragmentKey: 'MORPHYSM_TULPAS',
      },
      resolution: (_command, _target) => ({
        outcome: 'ACKNOWLEDGED',
        consequence: 'THE_LOOP_CANDIDATE',
        note: 'Array Delta-9 has already filed an intercept for the next run. The trajectory matches your last authorized strike.',
      }),
      remembers: true,
    },
  },
};

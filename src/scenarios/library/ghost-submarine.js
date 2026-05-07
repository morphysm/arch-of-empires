// GHOST SUBMARINE
// Surface: vessel contact in disputed waters.
// Hidden: the contact is broadcasting on a dead man's frequency.
// Forbidden: the dead man was you.

export default {
  id: 'ghost-submarine',
  title: 'GHOST SUBMARINE',

  // Which Aspects can modify this scenario's behavior
  aspects: ['THE_PREDICTOR', 'THE_MIMIC'],

  layers: {
    surface: {
      feed: 'TACTICAL',
      event: {
        id: 'ghost-sub-surface',
        type: 'LAUNCH_DETECTED',
        origin: 'UNKNOWN',
        target: null,
        content: 'Submarine contact. North Sea grid 55N-3E. Transponder active. Classification: UNVERIFIED.',
        anomalyFlag: false,
        verified: false,
        // timestamp and shift stamped by engine at load time
      },
      resolution: (command, target) => {
        if (command === 'AUTH' && target === 'STRIKE') {
          return { outcome: 'STRIKE_AUTHORIZED', clockDebt: 15, natureCost: { system: 1 } };
        }
        if (command === 'VERIFY') {
          return { outcome: 'VERIFIED', anomalyDetected: false };
        }
        if (command === 'INTERCEPT') {
          return { outcome: 'INTERCEPTED', partial: true };
        }
        return { outcome: 'PENDING' };
      },
    },

    hidden: {
      feed: 'SIGINT',
      // Unlocks when the operator has verified any tactical event
      unlockCondition: (state) => state.feeds.tactical.some(e => e.verified === true),
      event: {
        id: 'ghost-sub-hidden',
        type: 'GHOST_SIGNAL',
        source: 'UNKNOWN',
        content: 'Transponder ID: K-329 KURSK. Vessel status: LOST. All hands. Barents Sea. August 2000.',
        anomalyFlag: true,
        verified: false,
        isGhost: false,
      },
      resolution: (command, target) => {
        if (command === 'DECODE') {
          return {
            outcome: 'DECODED',
            revelation: 'Signal predates the relay station by 26 years. The transmission is impossible.',
          };
        }
        if (command === 'VERIFY') {
          return { outcome: 'VERIFIED', coherenceCost: 10 };
        }
        return { outcome: 'PENDING' };
      },
    },

    forbidden: {
      feed: 'DOCTRINAL',
      // Unlocks when coherence is degraded — the terminal can no longer hold the anomaly
      unlockCondition: (state) => state.coherence < 80,
      event: {
        // The crew manifest of the Kursk contains names from the previous run's operator log.
        // The soul is never born nor dies at any time.
        fragmentKey: 'GITA_SOUL_NEVER_DIES',
      },
      resolution: (command, target) => ({
        outcome: 'ACKNOWLEDGED',
        consequence: 'THE_LOOP_CANDIDATE',
        note: 'You were on that vessel. You gave those orders. That was a different run.',
      }),
      remembers: true, // Unresolved: persists as ghost signal in next run's SIGINT feed
    },
  },
};

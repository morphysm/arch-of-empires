// SHADOW VALLEY
// Surface: garbled voice intercept on a military frequency — fragments of Psalm 23:4,
//          aircraft systems noise, crew status ARMED. The pilot is mid-mission.
// Hidden:  full decryption available after the detonation is confirmed.
//          The pilot recited this before every mission. This was the last one.
// Forbidden: mission authorization hash matches this terminal's session token.
//            The crew performed their duty. The operator performed theirs.

export default {
  id: 'shadow-valley',
  title: 'SHADOW VALLEY',

  aspects: ['THE_DISSOLVER', 'THE_MEMETIC'],

  layers: {
    surface: {
      feed: 'SIGINT',
      event: {
        id: 'shadow-valley-surface',
        type: 'INTERCEPT_PARTIAL',
        source: 'MILITARY FREQUENCY — UHF ENCRYPTED',
        content: '[PARTIAL DECRYPT] "...valley of the shadow..." [BACKGROUND: TURBINE / PRESSURIZATION SYSTEM] "...fear no evil..." [SIGNAL: AIRBORNE ORIGIN] [CREW COUNT: 3] [WEAPONS STATUS: ARMED]',
        anomalyFlag: false,
        verified: false,
      },
      resolution: (command, _target) => {
        if (command === 'INTERCEPT') {
          return {
            outcome: 'INTERCEPTED',
            partial: false,
            revelation: 'Full audio capture. Single voice. Continuous recitation. No distress indicator. The transmission was not intended to be heard.',
          };
        }
        if (command === 'TRIANGULATE') {
          return {
            outcome: 'TRIANGULATED',
            revelation: 'Origin: airborne, high altitude, subsonic. Bearing consistent with active flight path over Central Asia. Weapons hardpoints: empty. The mission is complete.',
          };
        }
        if (command === 'DECODE') {
          return {
            outcome: 'DECODED',
            revelation: 'Encryption: standard military protocol. Mission designation: redacted. Crew manifest: redacted. Voice biometric: PILOT, unregistered. The pilot is not in the system.',
          };
        }
        if (command === 'VERIFY') {
          return {
            outcome: 'VERIFIED',
            anomalyDetected: false,
            revelation: 'Signal authentication: valid. Aircraft transponder: inactive by protocol. The transmission is genuine. The crew is alive.',
          };
        }
        return { outcome: 'PENDING' };
      },
    },

    hidden: {
      feed: 'SIGINT',
      // The detonation in tactical confirms whose prayer was being transmitted.
      unlockCondition: (state) => state.feeds.tactical.some(e => e.type === 'DETONATION_CONFIRMED'),
      event: {
        id: 'shadow-valley-hidden',
        type: 'SIGNAL_DECRYPTED',
        source: 'MISSION AUDIO — FULL TRANSCRIPT',
        content: '"Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me." [TRANSMISSION ENDS] [WEAPONS RELEASE: CONFIRMED] [DETONATION: CONFIRMED — 140KT] [CREW: RETURNING TO BASE] [MISSION: COMPLETE]',
        anomalyFlag: true,
        verified: false,
      },
      resolution: (command, _target) => {
        if (command === 'VERIFY') {
          return {
            outcome: 'VERIFIED',
            anomalyDetected: false,
            revelation: 'Signal authentication: valid. Crew biometrics match active roster. The pilot recited this before every mission. This was the last one.',
          };
        }
        if (command === 'DECODE') {
          return {
            outcome: 'DECODED',
            revelation: 'Mission timestamp pre-dates this Shift by 22 minutes. The bomb had already fallen when the intercept was captured. The prayer was live. The detonation was not.',
          };
        }
        if (command === 'INTERCEPT') {
          return {
            outcome: 'INTERCEPTED',
            partial: false,
            revelation: 'Strike authorization: classified. Origin: encrypted. The crew followed orders. They did not know who gave them.',
          };
        }
        return { outcome: 'PENDING' };
      },
    },

    forbidden: {
      feed: 'DOCTRINAL',
      unlockCondition: (state) => state.coherence < 55,
      event: {
        // "You have a right to perform your prescribed duties..."
        // The crew performed their duty. The operator performed theirs.
        // This fragment appears because the authorization chain ends here.
        fragmentKey: 'GITA_DUTY_WITHOUT_ATTACHMENT',
      },
      resolution: (_command, _target) => ({
        outcome: 'ACKNOWLEDGED',
        consequence: 'COMPLICITY_LOGGED',
        note: 'Mission authorization hash matches terminal session token. The strike order originated from this seat. The crew performed their duty. You performed yours.',
      }),
      remembers: true,
    },
  },
};

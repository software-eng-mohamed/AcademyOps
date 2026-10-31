import { PROFILES } from '../config.js';

console.log('profile users ramp hold cooldown minimum-runners');
for (const [name, profile] of Object.entries(PROFILES)) {
  console.log(
    [
      name,
      profile.users,
      profile.ramp,
      profile.hold,
      profile.cooldown,
      profile.minimumRunners,
    ].join(' '),
  );
}

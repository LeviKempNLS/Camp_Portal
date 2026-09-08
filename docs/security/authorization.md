# Authorization

Authorization is server-side and permission-based. Parent users can access only their authorized households. Registrar, treasurer, medical, counselor, director, and system-administrator roles receive granular permissions; the interface alone is never an authorization boundary.

Required high-sensitivity permissions include `medical.read`, `medical.write`, `payment.read`, `payment.record`, `registration.approve`, and `user.manage`.

This demo implements role records for Parent, Registrar, Camp Director, and System Administrator. The current slice enforces parent household ownership and registrar registration-list access in reusable database helpers. It does not log password material, session tokens, medical answers, or complete form-answer payloads.

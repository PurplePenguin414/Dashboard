const bcrypt = require('bcrypt');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/set-password.js "your password"');
  process.exit(1);
}

bcrypt.hash(password, 12).then((hash) => {
  console.log(`APP_PASSWORD_HASH=${hash}`);
});

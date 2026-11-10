// One-shot setup: creates the local n8n owner account through the same REST
// call the first-run screen uses. Does nothing if an owner already exists.
const base = process.env.N8N_URL || 'http://n8n:5678';
const email = process.env.N8N_OWNER_EMAIL;
const password = process.env.N8N_OWNER_PASSWORD;

async function main() {
  if (!email || !password) throw new Error('N8N_OWNER_EMAIL and N8N_OWNER_PASSWORD are required');

  const settings = await fetch(`${base}/rest/settings`).then((r) => r.json());
  const showSetup = settings && settings.data && settings.data.userManagement && settings.data.userManagement.showSetupOnFirstLoad;
  if (showSetup === false) {
    console.log('Owner already set up, nothing to do.');
    return;
  }

  const res = await fetch(`${base}/rest/owner/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, firstName: 'Demo', lastName: 'Owner' }),
  });
  if (!res.ok) throw new Error(`Owner setup failed: ${res.status} ${await res.text()}`);
  console.log(`Created owner ${email}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

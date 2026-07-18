const $ = (id) => document.getElementById(id);
const api = window.profileAPI;
const views = ['loadingView', 'createView', 'manageView'];
let status = null;
const show = (id) => views.forEach((name) => { $(name).hidden = name !== id; });
const initials = (name) => String(name || 'E').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || 'E';
const setAvatar = (node, profile) => { node.textContent = initials(profile?.name); node.style.background = `linear-gradient(135deg,${profile?.avatarColor || '#845cff'},#35dcff)`; };
const error = (id, message = '') => { $(id).textContent = message; };

async function load() {
  status = await api.status();
  if (!status.exists) { show('createView'); $('createName').focus(); return; }
  fillManage(status.profile); show('manageView');
}
function fillManage(profile) { setAvatar($('manageAvatar'), profile); $('manageName').value = profile?.name || ''; $('manageEmail').value = profile?.email || ''; $('manageColor').value = profile?.avatarColor || '#845cff'; }

$('createName').addEventListener('input', () => setAvatar($('createAvatar'), { name: $('createName').value }));
$('createForm').addEventListener('submit', async (event) => {
  event.preventDefault(); error('createError');
  try { await api.create({ name: $('createName').value, email: $('createEmail').value }); window.close(); }
  catch (err) { error('createError', err.message); }
});
$('manageForm').addEventListener('submit', async (event) => {
  event.preventDefault(); error('manageError');
  try { status = await api.update({ name: $('manageName').value, email: $('manageEmail').value, avatarColor: $('manageColor').value }); error('manageError', 'Saved successfully.'); fillManage(status.profile); }
  catch (err) { error('manageError', err.message); }
});
$('resetBrowser').onclick = async () => {
  error('resetError');
  if (!$('resetConfirm').checked) return error('resetError', 'Confirm that you understand this cannot be undone.');
  if (!confirm('Permanently erase all Evasion Browser data on this computer?')) return;
  $('resetBrowser').disabled = true; $('resetBrowser').textContent = 'Resetting…';
  try { await api.resetBrowserData(); }
  catch (err) { $('resetBrowser').disabled = false; $('resetBrowser').textContent = 'Reset browser and restart'; error('resetError', err.message); }
};
load().catch((err) => { show('createView'); error('createError', err.message); });

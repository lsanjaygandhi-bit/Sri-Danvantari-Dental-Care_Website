// My account: change password, sign out everywhere.
import { h, toast, confirmDialog } from '../ui.js';
import { ctx, pageHead, ROLE_LABEL } from '../core.js';
import { passwordProblem } from '../app.js';

export async function render(content) {
  const cur = h('input', { type: 'password', autocomplete: 'current-password', maxlength: 200, id: 'acc-cur' });
  const p1 = h('input', { type: 'password', autocomplete: 'new-password', maxlength: 200, id: 'acc-p1' });
  const p2 = h('input', { type: 'password', autocomplete: 'new-password', maxlength: 200, id: 'acc-p2' });
  const msg = h('p', { class: 'form-msg', role: 'alert' });
  const change = h('button', { class: 'btn', type: 'button', text: 'Change password', onclick: async () => {
    msg.className = 'form-msg err';
    const problem = passwordProblem(p1.value);
    if (!cur.value) { msg.textContent = 'Enter your current password.'; return; }
    if (problem) { msg.textContent = problem; return; }
    if (p1.value !== p2.value) { msg.textContent = 'The new passwords do not match.'; return; }
    if (p1.value === cur.value) { msg.textContent = 'Choose a password different from the current one.'; return; }
    change.disabled = true;
    // Re-check the current password before allowing the change.
    const { error: authErr } = await ctx.sb.auth.signInWithPassword({ email: ctx.me.email, password: cur.value });
    if (authErr) { msg.textContent = 'Current password is incorrect.'; change.disabled = false; return; }
    const { error } = await ctx.sb.auth.updateUser({ password: p1.value });
    change.disabled = false;
    if (error) { msg.textContent = error.message; return; }
    cur.value = p1.value = p2.value = '';
    msg.className = 'form-msg ok'; msg.textContent = 'Password changed.';
    toast('Password changed.', 'ok');
  } });
  content.replaceChildren(
    pageHead('My account', `${ctx.me.email} · ${ROLE_LABEL[ctx.me.role]}`),
    h('div', { class: 'panel' }, h('h2', { text: 'Change password' }),
      h('label', { for: 'acc-cur', text: 'Current password' }), cur,
      h('label', { for: 'acc-p1', text: 'New password' }), p1, h('span', { class: 'hint', text: 'At least 10 characters, with a letter and a number.' }),
      h('label', { for: 'acc-p2', text: 'Repeat new password' }), p2,
      h('div', { class: 'btn-row' }, change), msg),
    h('div', { class: 'panel' }, h('h2', { text: 'Sessions' }),
      h('p', { class: 'muted', text: 'You are signed out automatically after 30 minutes of inactivity, and after 12 hours in any case. If you used a shared or lost device, sign out everywhere.' }),
      h('button', { class: 'btn ghost', type: 'button', text: 'Sign out on all devices', onclick: async () => {
        if (!(await confirmDialog('Sign out everywhere?', 'You will be signed out on every device, including this one.', 'Sign out everywhere', false))) return;
        await ctx.sb.auth.signOut({ scope: 'global' });
        location.reload();
      } })));
}

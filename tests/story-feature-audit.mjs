import fs from 'node:fs';
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const stories = fs.readFileSync(new URL('../js/stories.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/hoviyat-2026-glass.css', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../js/admin.js', import.meta.url), 'utf8');
for (const id of ['storiesHolder','storyComposerModal','storyViewerModal','storyPeopleModal','notificationsModal']) {
  if (!index.includes(`id="${id}"`)) throw new Error(`missing ${id}`);
}
if (!app.includes('startOutgoingCall(false)') || !app.includes('startOutgoingCall(true)')) throw new Error('call buttons are not wired');
if (app.includes('toast("در حال تکمیل و توسعه این بخش هستیم");')) throw new Error('legacy call placeholder remains');
if (!stories.includes("from('story_reactions')") || !stories.includes("from('story_replies')") || !stories.includes("from('story_views')")) throw new Error('story data paths missing');
if (!css.includes('#appShell #view-secretchat .chat-ai-panel') || !css.includes('#appShell #view-chat,#appShell #view-secretchat{display:flex')) throw new Error('scroll/secret layout guard missing');
if (!admin.includes('admin-delete-story') || !admin.includes('app_feature_flags')) throw new Error('admin story/feature controls missing');
console.log('STORY-FEATURE AUDIT PASS');

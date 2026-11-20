function versionLabel(revision){return revision===null?'local storage':`revision ${revision}`;}
function countLabel(value){return [['boards','board'],['projects','project'],['cards','card']].map(([key,label])=>`${value[key]} ${label}${value[key]===1?'':'s'}`).join(', ');}

export function recoveryChoicePrompt(details,choice,hasEditorChanges=false) {
  const mine=`Your last submitted changes: ${countLabel(details.candidate)} (based on ${versionLabel(details.baseRevision)}).`;
  const latest=`Checked saved version: ${countLabel(details.latest)} (${versionLabel(details.latest.revision)}).`;
  const action=choice==='replace'
    ? 'Replace the entire saved workspace, including every board and project, with your last submitted changes? This can remove changes saved on another device.'
    : 'Use the checked saved workspace and discard your retained submitted changes? Download your changes first if you need a copy.';
  const editor=hasEditorChanges?'\n\nOpen editor values will be closed after this succeeds. Additional edits typed since your last Save are not included. Cancel to keep editing.':'';
  return `${mine}\n${latest}\n\n${action}${editor}`;
}

/** Render only safe status/count metadata; snapshot contents stay in the controller. */
export function renderRecoveryDialog(dialog,{status,details,onCheck,onUseLatest,onReplace,onDownload,onClose}) {
  const document=dialog.ownerDocument||globalThis.document;
  const node=(tag,text)=>{const item=document.createElement(tag);if(text)item.textContent=text;return item;};
  function action(label,run,primary=false) {
    const control=node('button',label);control.type='button';control.className=primary?'primary':'secondary';control.disabled=status.pending;
    control.onclick=()=>{void Promise.resolve().then(run).catch(()=>{});};
    return control;
  }
  dialog.setAttribute('aria-label','Recover workspace changes');
  const heading=node('h2','Recover your changes');
  const message=node('p',status.message||'Review the latest saved version before choosing which changes to keep.');
  message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  const close=action('Close',onClose);close.disabled=false;close.dataset.saveAllowed='true';
  dialog.replaceChildren(heading,message);
  if(details.candidate){
    dialog.append(node('p',`Your last submitted changes: ${countLabel(details.candidate)}; based on ${versionLabel(details.baseRevision)}.`));
    dialog.append(node('p','Downloads contain your last submitted workspace. Additional text still in an editor is not included.'));
    dialog.append(action('Download my unsaved changes',onDownload));
    dialog.append(action('Check latest version',onCheck,true));
    if(details.latest){
      dialog.append(node('p',`Latest version checked: ${countLabel(details.latest)}; ${versionLabel(details.latest.revision)}${details.latest.exists?'':'; no saved workspace yet'}.`));
      dialog.append(action('Use the latest saved version',onUseLatest));
      dialog.append(action('Replace the latest version with my changes',onReplace));
    }
  }
  dialog.append(close);
}

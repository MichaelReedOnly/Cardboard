function counts(value){return [['boards','board'],['projects','project'],['cards','card']].map(([key,label])=>`${value[key]} ${label}${value[key]===1?'':'s'}`).join(', ');}

export function migrationConfirmation(details) {
  return `Replace the entire workspace in account ${details.account}?\n\nSource: ${details.label} — ${counts(details.source)}.\nCurrent account: ${counts(details.destination)} at revision ${details.destination.revision}.\n\nThis replaces every board, project and card; it does not merge or append. Changes from another device may be removed. The original browser-local data or selected backup file will remain unchanged.`;
}

export function renderMigrationDialog(dialog,{details,onSourceBackup,onDestinationBackup,onConfirm,onRetry,onRecover,onChooseBackup,onClose}) {
  const document=dialog.ownerDocument||globalThis.document;
  const node=(tag,text)=>{const item=document.createElement(tag);if(text)item.textContent=text;return item;};
  const action=(label,run,primary=false)=>{
    const control=node('button',label);control.type='button';control.className=primary?'primary':'secondary';control.disabled=details.pending;
    control.onclick=()=>{void Promise.resolve().then(run).catch(()=>{});};return control;
  };
  dialog.setAttribute('aria-label','Import into your account');
  const status=node('p',details.message);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  dialog.replaceChildren(node('h2','Import into your account'),node('p',`Destination: ${details.account}`),status);
  if(details.source){
    dialog.append(node('p',`Source: ${details.label} — ${counts(details.source)}.`));
    dialog.append(action('Download source backup',onSourceBackup));
  }
  if(details.destination){
    dialog.append(node('p',details.destination.exists
      ? `Current account: ${counts(details.destination)}; revision ${details.destination.revision}.`
      : 'This account has no saved workspace yet.'));
    const backup=action('Download current account backup',onDestinationBackup);backup.disabled=details.pending||!details.destination.exists;dialog.append(backup);
  }
  if(details.phase==='preview' && !details.tooLarge)dialog.append(action('Replace my account workspace',onConfirm,true));
  if(details.canRetry)dialog.append(action('Check account again',onRetry,true));
  if(details.needsRecovery)dialog.append(action('Review save recovery',onRecover));
  if(!details.needsRecovery)dialog.append(action('Choose a JSON backup',onChooseBackup));
  dialog.append(node('p','Browser-local cards are tied to this browser and web address, not to a signed-in account. For another device, browser or address, export a JSON backup there and select it here.'));
  const close=action('Close',onClose);close.dataset.saveAllowed='true';close.disabled=details.phase==='saving';dialog.append(close);
}

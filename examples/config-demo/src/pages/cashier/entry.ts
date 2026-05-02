import config from 'virtual:lhx-kit/project-config';

document.getElementById('app')!.innerHTML = `
  <h1>${config.pages.find(p => p.name === 'cashier')?.title}</h1>
  <p>offline-eligible page (part of offline.whitelistPages).</p>
`;

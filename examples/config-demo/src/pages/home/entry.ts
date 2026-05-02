import config from 'virtual:lhx-kit/project-config';

document.getElementById('app')!.innerHTML = `
  <h1>${config.pages.find(p => p.name === 'home')?.title}</h1>
  <p>project: ${config.name} / mode: ${config.mode}</p>
  <p>apiBase: ${String(config.env.apiBase ?? '')}</p>
`;

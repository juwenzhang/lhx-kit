import config from 'virtual:lhx-kit/project-config';

document.getElementById('app')!.innerHTML = `
  <h1>${config.pages.find(p => p.name === 'orders')?.title}</h1>
  <p>regular MPA page.</p>
`;

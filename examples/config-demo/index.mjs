import {
  formatDiagnostics,
  listPages,
  loadConfigs,
  validateAgainstFilesystem
} from '@lhx-kit/config';

const {project, offline} = await loadConfigs(process.cwd());
console.log('project:', project.config.name, project.config.framework);
console.log('pages :', Object.keys(project.config.pages));
console.log('offline versions:', offline?.config.versions);
console.log('home entry      :', project.config.pages.home.entry);
console.log(
  'offline-only pages:',
  listPages(project.config, offline?.config ?? null, {offline: true}).map(p => p.name)
);
console.log('--- diagnostics ---');
console.log(formatDiagnostics(validateAgainstFilesystem(project.config, offline?.config ?? null)));

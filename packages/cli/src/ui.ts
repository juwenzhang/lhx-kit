import {bold, cyan, dim, green, red, yellow} from 'kolorist';

export function section(title: string): void {
  console.log(`\n${bold(cyan(title))}`);
}

export function info(line: string): void {
  console.log(`${cyan('›')} ${line}`);
}

export function success(line: string): void {
  console.log(`${green('✓')} ${line}`);
}

export function warn(line: string): void {
  console.log(`${yellow('⚠')} ${line}`);
}

export function error(line: string): void {
  console.log(`${red('✗')} ${line}`);
}

export function muted(line: string): void {
  console.log(dim(line));
}

/**
 * @lib-mono-smoke/utils — utility helpers.
 */
import {Core} from '@lib-mono-smoke/core';

export function shout(input: string): string {
  return `${input.toUpperCase()}!`;
}

export function makeGreeter(greeting: string) {
  return new Core({greeting});
}

/**
 * @fileoverview Flags checks that the construction itself already guarantees.
 *
 * A path point lies on its path, a midpoint is the midpoint, a circle centre
 * is the centre. Re-checking those only confirms that the engine executed the
 * command; it says nothing about the problem condition, so the tool reports
 * them as warnings instead of counting them as independent evidence.
 */
import type { Check, Request, Step } from './schema.js';

export interface Tautology {
  requirement: string; check: number; kind: string; subjects: string[];
  message: string;
}
interface Construction { command: string; args: string[] }

/** Reads `id=Command(args)` from a native step; equations and literals exit. */
function construction(step: Step): Construction | null {
  if (step.op !== 'native') return null;
  const match = /^([A-Za-z][A-Za-z0-9_{}]*)\s*=\s*([A-Za-z]\w*)\s*\(([^()]*)\)\s*$/
    .exec(step.source.trim());
  if (!match || match[1] !== step.id) return null;
  return {
    command: match[2]!,
    args: match[3]!.split(',').map(part => part.trim()).filter(Boolean),
  };
}

function pointOn(first: string, path: string, built: Construction) {
  if (built.command === 'Point' && built.args[0] === path) {
    return `${first} is Point(${path}), so it lies on the path by construction`;
  }
  if (built.command === 'Intersect' && built.args.includes(path)) {
    return `${first} is Intersect(...), so it lies on ${path} by construction`;
  }
  return null;
}

function midpoint(check: Check, built: Construction) {
  const [, left, right] = check.subjects;
  if (built.command !== 'Midpoint' || !left || !right) return null;
  return built.args.includes(left) && built.args.includes(right) ?
    `${check.subjects[0]} is Midpoint(${left}, ${right}) by construction` : null;
}

function centered(check: Check, built: Construction) {
  const center = check.subjects[1];
  return center && built.command === 'Circle' && built.args[0] === center ?
    `${check.subjects[0]} is Circle(${center}, ...) by construction` : null;
}

function aligned(
  check: Check, lines: Map<string, Construction>, commands: string[],
) {
  const [first, second] = check.subjects;
  const built = second ? lines.get(second) : undefined;
  if (!first || !built || !commands.includes(built.command) ||
    !built.args.includes(first)) return null;
  return `${second} is ${built.command}(..., ${first}) by construction`;
}

/** Relations that a single construction command already guarantees. */
function reason(
  check: Check, lines: Map<string, Construction>,
): string | null {
  const first = check.subjects[0];
  const built = first ? lines.get(first) : undefined;
  if (check.kind === 'pointOn' && built && check.subjects[1]) {
    return pointOn(first!, check.subjects[1]!, built);
  }
  if (check.kind === 'midpoint' && built) return midpoint(check, built);
  if (check.kind === 'center' && built) return centered(check, built);
  if (check.kind === 'parallel') {
    return aligned(check, lines, ['Line', 'ParallelLine']);
  }
  if (check.kind === 'perpendicular') {
    return aligned(check, lines, ['OrthogonalLine', 'PerpendicularLine']);
  }
  return null;
}

/** Reports every check whose predicate follows from the program itself. */
export function tautologies(
  program: Step[],
  requirements: Request['plan']['requirements'],
): Tautology[] {
  const lines = new Map<string, Construction>();
  for (const step of program) {
    const built = construction(step);
    if (built) lines.set(step.id, built);
  }
  const found: Tautology[] = [];
  for (const requirement of requirements) {
    requirement.checks.forEach((check, index) => {
      const message = reason(check, lines);
      if (message) {
        found.push({
          requirement: requirement.id, check: index, kind: check.kind,
          subjects: check.subjects, message,
        });
      }
    });
  }
  return found;
}

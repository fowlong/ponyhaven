export function username(value) {
  const name = String(value ?? '').normalize('NFKC').trim();
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _.'-]{1,23}$/u.test(name))
    throw new Error('Choose a name of 2–24 letters, numbers, spaces, or simple punctuation.');
  return name;
}

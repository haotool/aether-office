export const results = [];
export const add = (id, title, status, lines = []) => results.push({ id, title, status, lines });
export const worst = (items, bad = 'fail') => (items.length ? bad : 'pass');

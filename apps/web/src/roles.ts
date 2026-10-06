/** The people who may change things: the owner and operators (viewers read only). */
export const isOperator = (role: string | undefined): boolean =>
  role === 'owner' || role === 'operator';

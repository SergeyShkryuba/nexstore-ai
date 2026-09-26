/** The assistant's menu buttons in button mode. Imports nothing: the widget uses it too. */
export const MENU_ACTIONS = ['search', 'orders', 'shipping', 'human'] as const
export type MenuAction = (typeof MENU_ACTIONS)[number]

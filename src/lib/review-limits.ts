/**
 * Longest review comment. The form, the server action and the database
 * (`reviews_comment_length` in schema.sql) all enforce it. Its own file so the
 * product page can use it without pulling zod into its bundle.
 */
export const MAX_REVIEW_LENGTH = 2000

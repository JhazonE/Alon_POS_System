import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, { message: 'Username is required' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export interface PosLoginFormProps {
  onLoginSuccess: (user: any) => void;
  /** Terminal identity shown in the card footer. Absent until terminal detection resolves. */
  terminalName?: string;
  /** Store this terminal belongs to; shown in the footer beside the terminal. */
  businessName?: string;
  currentTime?: string;
}

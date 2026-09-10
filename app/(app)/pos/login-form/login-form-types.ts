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
  /** Business name and logo from system settings; falls back to the Alon branding. */
  businessName?: string;
  logoPath?: string;
  currentTime?: string;
}

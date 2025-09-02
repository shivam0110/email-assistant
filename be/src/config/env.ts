import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().min(1000).max(65535)).default('4000'),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:3000'),
  CLERK_PUBLISHABLE_KEY: z.string().min(1, 'Clerk publishable key is required'),
  CLERK_SECRET_KEY: z.string().min(1, 'Clerk secret key is required'),
  NYLAS_CLIENT_ID: z.string().min(1, 'Nylas client ID is required'),
  NYLAS_CLIENT_SECRET: z.string().min(1, 'Nylas client secret is required'),
  NYLAS_GRANT_ID: z.string().min(1, 'Nylas grant ID is required'),
});

function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:');
      console.error(error.errors.map(err => `  ${err.path.join('.')}: ${err.message}`).join('\n'));
      process.exit(1);
    }
    throw error;
  }
}

export const config = validateEnv();

export type Config = typeof config; 
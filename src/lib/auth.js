import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { customSession } from "better-auth/plugins";
import { db } from "../drizzle/index";
import * as schema from "../drizzle/schema";
import { stripe } from "./stripe";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      user: schema.users,
    },
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },
  plugins: [
    customSession(async ({ user, session }) => {
      if (!user?.id) return { user, session };

      const userRecord = await db
        .select({ hasAccess: schema.users.hasAccess })
        .from(schema.users)
        .where(eq(schema.users.id, user.id))
        .limit(1);

      const hasAccess = userRecord[0]?.hasAccess || false;

      return {
        user: {
          ...user,
          hasAccess,
        },
        session,
      };
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const userId = user?.id;
          const email = user?.email;
          const name = user?.name;

          if (!userId || !email) {
            return;
          }

          const stripeCustomer = await stripe.customers.create({
            email,
            name: name ?? undefined,
          });

          await db
            .update(schema.users)
            .set({ stripeCustomerId: stripeCustomer?.id })
            .where(eq(schema.users.id, userId));
        },
      },
    },
  },
});

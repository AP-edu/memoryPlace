
import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import bcrypt from "bcryptjs";
import { getSupabase } from "@/lib/supabase";

async function linkOrCreateOAuthUser(email: string, name?: string | null) {
  const db = getSupabase();
  const { data: existing } = await db
    .from("users")
    .select("id, name, email, role")
    .ilike("email", email)
    .maybeSingle();
  if (existing) return existing;

  const { data: firstUser } = await db.from("users").select("id").limit(1).maybeSingle();
  const { data: created } = await db
    .from("users")
    .insert({ name: name ?? email, email, password: "", role: firstUser ? "user" : "admin" })
    .select("id, name, email, role")
    .single();
  return created;
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const { data: user } = await getSupabase()
          .from("users")
          .select("*")
          .ilike("email", credentials.email)
          .maybeSingle();

        if (!user) return null;

        // OAuth-linked rows carry an empty password and can never sign in here.
        if (!user.password) return null;
        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
    // Google is live once GOOGLE_CLIENT_ID/SECRET are set (Vercel env).
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    // Apple is a stub until APPLE_ID/SECRET are registered for the prod domain.
    ...(process.env.APPLE_ID && process.env.APPLE_SECRET
      ? [
          AppleProvider({
            clientId: process.env.APPLE_ID,
            clientSecret: process.env.APPLE_SECRET,
          }),
        ]
      : []),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account }) {
      // Link OAuth logins to a local user row (creates one on first login)
      // so ownership/session code keeps working unchanged.
      if (account?.provider === "google" || account?.provider === "apple") {
        if (!user.email) return false;
        const row = await linkOrCreateOAuthUser(user.email, user.name);
        if (!row) return false;
        user.id = row.id;
        user.role = row.role;
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      return session;
    },
  },
  pages: { signIn: "/login" },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
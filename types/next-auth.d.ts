
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    role: "user" | "admin";
  }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: "user" | "admin";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "user" | "admin";
  }
}
import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
  callbacks: {
    authorized: ({ token, req }) => {
      const path = req.nextUrl.pathname;
      if (path.startsWith("/admin")) return token?.role === "admin";
      return !!token;
    },
  },
});

export const config = {
  matcher: ["/home", "/home/:path*", "/dashboard/:path*", "/admin/:path*", "/quiz/:path*", "/results/:path*", "/profile/:path*", "/palaces/:path*", "/rooms/:path*", "/study/:path*", "/spike-3d/:path*", "/walk/:path*"],
};
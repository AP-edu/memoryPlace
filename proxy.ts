import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized: ({ token, req }) => {
      const path = req.nextUrl.pathname;
      if (path.startsWith("/admin")) return token?.role === "admin";
      return !!token;
    },
  },
});

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/quiz/:path*", "/results/:path*", "/profile/:path*"],
};
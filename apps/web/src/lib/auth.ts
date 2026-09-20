import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

/**
 * Single-user gate: this dashboard has one operator, not a user base. The
 * signIn callback rejects any GitHub account except the one named in
 * ALLOWED_GITHUB_LOGIN - everything downstream (middleware, pages) only
 * needs to check "is there a session," not re-check identity.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    async signIn({ profile }) {
      const allowedLogin = process.env.ALLOWED_GITHUB_LOGIN;
      if (!allowedLogin) {
        console.error("ALLOWED_GITHUB_LOGIN is not set - refusing every sign-in");
        return false;
      }
      return profile?.login === allowedLogin;
    },
  },
});

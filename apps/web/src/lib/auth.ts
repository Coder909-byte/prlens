import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

/**
 * Single-user gate: this dashboard has one operator, not a user base. The
 * signIn callback rejects any GitHub account except the one named in
 * ALLOWED_GITHUB_LOGIN - everything downstream (middleware, pages) only
 * needs to check "is there a session," not re-check identity.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // The built-in GitHub provider never sets `issuer` (@auth/core has a
    // literal "// TODO: review fallback issuer" where it defaults to the
    // placeholder "https://authjs.dev" when one isn't given). GitHub's
    // callback includes a real `iss=https://github.com/login/oauth`
    // parameter (RFC 9207), which oauth4webapi then validates against
    // that placeholder and always rejects - "unexpected iss (issuer)
    // response parameter value" - regardless of whether the code/secret
    // are correct. Declaring the real issuer here fixes it without
    // triggering OIDC discovery (GitHub's provider already sets `token`/
    // `userinfo` URLs directly, so @auth/core's discovery-fetch branch is
    // skipped either way).
    GitHub({ issuer: "https://github.com/login/oauth" }),
  ],
  trustHost: true,
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

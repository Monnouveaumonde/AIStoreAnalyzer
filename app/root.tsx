import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";

export default function App() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`.trim() || "Erreur HTTP"
    : error instanceof Error
      ? (error.message || "Une erreur est survenue")
      : "Une erreur est survenue";

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Erreur - AI Store Analyzer</title>
      </head>
      <body style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: "600px", margin: "0 auto" }}>
        <h1>Application Error</h1>
        <p><strong>{message}</strong></p>
        {error instanceof Error && error.stack && (
          <pre style={{ background: "#f5f5f5", padding: "1rem", overflow: "auto", fontSize: "12px" }}>
            {error.stack}
          </pre>
        )}
        <p>
          <a href="/auth/login">Retour à la connexion</a>
          {" · "}
          <a href="/">Accueil</a>
        </p>
        <Scripts />
      </body>
    </html>
  );
}

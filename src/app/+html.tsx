import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Цвет заставки до гидрации JS, чтобы не мелькал белый кадр.
const SPLASH = '#0F0E0C';

export default function Html({ children }: PropsWithChildren) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `html,body,#root{height:100%;background-color:${SPLASH}}body{overflow:hidden}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

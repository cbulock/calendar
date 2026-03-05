#!/bin/sh
# Container entrypoint — optionally configures HTTP Basic Auth, then starts supervisord.
#
# To enable authentication set AUTH_USER and AUTH_PASSWORD environment variables:
#
#   docker run -e AUTH_USER=admin -e AUTH_PASSWORD=secret -p 80:80 calendar
#
# When both variables are set, a hashed password file is generated and nginx is
# configured to require credentials for every request (both the app and the API).
# When neither variable is set, the app is served without authentication.

set -e

if [ -n "$AUTH_USER" ] && [ -n "$AUTH_PASSWORD" ]; then
  echo "Enabling HTTP Basic Auth for user: $AUTH_USER"
  printf '%s:%s\n' "$AUTH_USER" "$(openssl passwd -6 "$AUTH_PASSWORD")" > /etc/nginx/.htpasswd
  printf 'auth_basic "Calendar";\nauth_basic_user_file /etc/nginx/.htpasswd;\n' > /etc/nginx/auth.conf
else
  # No credentials provided — create empty auth.conf so nginx includes work.
  printf '' > /etc/nginx/auth.conf
fi

exec /usr/bin/supervisord -c /etc/supervisord.conf

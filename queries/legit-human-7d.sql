SELECT
  url_path,
  COUNT(*) AS hits,
  MAX(timestamp) AS last_seen
FROM access_logs
WHERE is_ai_bot = 0
  AND timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
  AND url_path NOT LIKE '%.env%'
  AND url_path NOT LIKE '%.aws%'
  AND url_path NOT LIKE '%.git%'
  AND url_path NOT LIKE '%/credentials%'
  AND url_path NOT LIKE '%/wp-%'
  AND url_path NOT LIKE '%/wp/%'
  AND url_path NOT LIKE '%/wordpress/%'
  AND url_path NOT LIKE '%/blog/%'
  AND url_path NOT LIKE '%xmlrpc.php%'
  AND url_path NOT LIKE '//%'
  AND url_path NOT LIKE '%.php%'
  AND url_path NOT LIKE '%.asp%'
  AND url_path NOT LIKE '%.aspx%'
  AND url_path NOT LIKE '%.jsp%'
  AND url_path NOT LIKE '%.cgi%'
  AND url_path NOT LIKE '%.js%'
  AND url_path NOT LIKE '%.css%'
  AND url_path NOT LIKE '%.jsx%'
  AND url_path NOT LIKE '%.tsx%'
  AND url_path NOT LIKE '%.config%'
  AND url_path NOT LIKE '%.conf%'
  AND url_path NOT LIKE '%.ini%'
  AND url_path NOT LIKE '%.yml%'
  AND url_path NOT LIKE '%.yaml%'
  AND url_path NOT LIKE '%/_environment%'
  AND url_path NOT LIKE '/www/%'
  AND url_path NOT LIKE '/uat/%'
  AND url_path NOT LIKE '/tmp/%'
  AND url_path NOT LIKE '/test/%'
  AND url_path NOT LIKE '/staging/%'
  AND url_path NOT LIKE '/webroot/%'
  AND url_path NOT LIKE '/webmail/%'
  AND url_path NOT LIKE '%/phpinfo%'
  AND url_path NOT LIKE '%/info'
  AND url_path NOT LIKE '%/info.%'
  AND url_path NOT LIKE '%/info/%'
  AND url_path NOT LIKE '%/info?%'
  AND url_path NOT LIKE '%/_profiler/%'
GROUP BY url_path
ORDER BY hits DESC;

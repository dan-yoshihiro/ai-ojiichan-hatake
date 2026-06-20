SELECT
  DATE(timestamp) AS day,
  COUNT(*) AS total,
  SUM(CASE WHEN is_ai_bot = 1 THEN 1 ELSE 0 END) AS ai,
  SUM(CASE WHEN is_ai_bot = 0 THEN 1 ELSE 0 END) AS humans_or_scanners,
  SUM(
    CASE
      WHEN is_ai_bot = 0
        AND url_path NOT LIKE '%.php%'
        AND url_path NOT LIKE '%.js%'
        AND url_path NOT LIKE '%.css%'
        AND url_path NOT LIKE '%/phpinfo%'
        AND url_path NOT LIKE '%/info%'
        AND url_path NOT LIKE '%/_profiler/%'
        AND url_path NOT LIKE '%settings.py%'
        -- 2026-06 スキャナー新シグネチャ
        AND url_path NOT LIKE '%.env%'
        AND url_path NOT LIKE '%.vars%'
        AND url_path NOT LIKE '%.json%'
        AND url_path NOT LIKE '%.map%'
        AND url_path NOT LIKE '%graphql%'
        AND url_path NOT LIKE '%/api/%'
        AND url_path NOT LIKE '%swagger%'
        AND url_path NOT LIKE '%/.well-known/%'
      THEN 1
      ELSE 0
    END
  ) AS legit_humans
FROM access_logs
WHERE timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
GROUP BY DATE(timestamp)
ORDER BY day DESC;

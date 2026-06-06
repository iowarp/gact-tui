Output "visual_loop/screenshots/semantic_cimis_weather_tool_summary.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_semantic_cimis_weather_tool.sh"
Enter
Show

Wait+Screen /CIMIS Station 80/
Screenshot "visual_loop/screenshots/semantic_cimis_weather_tool_thinking.png"
Wait+Screen /CSV data analysis/
Screenshot "visual_loop/screenshots/semantic_cimis_weather_tool_profile_started.png"
Wait+Screen /csv result:/
Wait+Screen /rows: 168/
Screenshot "visual_loop/screenshots/semantic_cimis_weather_tool_profile_summary.png"
Wait+Screen /time-series visualization/
Wait+Screen /PlotWeatherTimeseries/
Screenshot "visual_loop/screenshots/semantic_cimis_weather_tool_plot_started.png"
Wait+Screen /artifact result:/
Wait+Screen /cimis_fresno_weather.png/
Sleep 700ms
Screenshot "visual_loop/screenshots/semantic_cimis_weather_tool_plot_summary.png"
Wait+Screen /session: seeded session 1 .* idle/
Sleep 700ms
Screenshot "visual_loop/screenshots/semantic_cimis_weather_tool_final.png"
Sleep 300ms
Type "q"

from astral import Observer, sun
from datetime import datetime, timedelta, timezone

obs = Observer(8.78, -82.44)
year = 2014
month = 4
day = 1

utc_offset = -5
tz = timezone(timedelta(hours=utc_offset))

start = datetime(year, month, day, 0, 0, tzinfo=tz)
end = start + timedelta(hours=24)

print(f"{'Time':>8}  {'Elev':>6}  {'Azim':>7}")
print("-" * 25)

t = start
while t < end:
    t_utc = t.astimezone(timezone.utc)
    elev = sun.elevation(obs, t_utc)
    azim = sun.azimuth(obs, t_utc)
    print(f"{t.strftime('%H:%M'):>8}  {elev:>6.1f}  {azim:>7.1f}")
    t += timedelta(minutes=5)
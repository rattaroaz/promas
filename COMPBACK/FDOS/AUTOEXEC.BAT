@ECHO off
ECHO Welcome to FreeDOS (http://www.freedos.org)!

REM Attempt to load TSRs high & before adding too much to the enviroment

REM Load the Mouse driver (autodetect mouse) (conventional mem or high)
REM C:\FDOS\CTMOUSE\CTMOUSE
REM LOADHIGH C:\FDOS\CTMOUSE\CTMOUSE

REM Load CD-ROM extensions SHSUCDX (FDCDEX)
REM SHSUCDX [/D:DriverName[,[Drive][,[Unit][,[MaxDrives]]]]]
REM To unload: SHSUCDX [-u or /u]
REM C:\FDOS\BIN\SHSUCDX /D:FDCD0001,R

REM Set the default search path for programs
PATH=C:\FDOS\BIN;C:\FDOS\BIN\KEY;
REM Add other directories here
REM SET PATH=%PATH%;C:\UTIL

REM Setup keyboard mappings
REM XKEYB uk

REM FreeDOS utilities specific, set language & location for those
REM that supports alternate language message catalogs via Cats
SET NLSPATH=C:\FDOS\NLS;
SET LANG=EN

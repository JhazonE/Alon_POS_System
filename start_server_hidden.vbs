' Alon POS System Server — hidden launcher
' Runs start_server.bat with a fully hidden window (style 0) so the Next.js
' server autostarts at boot WITHOUT a visible/minimized console window.
' Kept as a wrapper (vs. removing the startup entry) so the server-start path
' — including the VerdixMySQL service check — stays exactly as before; only the
' console window is suppressed.
Dim shell, fso, batPath
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
' start_server.bat lives in the same folder as this script ({app}).
batPath = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "start_server.bat")
' 0 = hidden window, False = don't wait for the batch to finish.
shell.Run """" & batPath & """", 0, False

$ErrorActionPreference = 'Stop'

$nativeSource = @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

public static class AudioBashJobOwner
{
    private const uint CREATE_NO_WINDOW = 0x08000000;
    private const uint CREATE_SUSPENDED = 0x00000004;
    private const uint DUPLICATE_SAME_ACCESS = 0x00000002;
    private const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
    private const uint FILE_ATTRIBUTE_NORMAL = 0x00000080;
    private const uint FILE_SHARE_READ = 0x00000001;
    private const uint FILE_SHARE_WRITE = 0x00000002;
    private const uint GENERIC_READ = 0x80000000;
    private const uint INFINITE = 0xFFFFFFFF;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    private const int JobObjectExtendedLimitInformation = 9;
    private const uint OPEN_EXISTING = 3;
    private const uint PROCESS_SYNCHRONIZE = 0x00100000;
    private const int STARTF_USESTDHANDLES = 0x00000100;
    private const int STD_ERROR_HANDLE = -12;
    private const int STD_OUTPUT_HANDLE = -11;
    private const uint WAIT_FAILED = 0xFFFFFFFF;
    private const uint WAIT_OBJECT_0 = 0;
    private const uint WAIT_TIMEOUT = 258;

    private static readonly IntPtr InvalidHandleValue = new IntPtr(-1);
    private static readonly IntPtr ProcThreadAttributeHandleList = new IntPtr(0x00020002);
    private static IntPtr jobHandle = IntPtr.Zero;
    private static IntPtr launcherHandle = IntPtr.Zero;
    private static IntPtr targetProcessHandle = IntPtr.Zero;
    private static IntPtr targetThreadHandle = IntPtr.Zero;

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SECURITY_ATTRIBUTES
    {
        public uint nLength;
        public IntPtr lpSecurityDescriptor;
        [MarshalAs(UnmanagedType.Bool)]
        public bool bInheritHandle;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct STARTUPINFO
    {
        public uint cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public uint dwX;
        public uint dwY;
        public uint dwXSize;
        public uint dwYSize;
        public uint dwXCountChars;
        public uint dwYCountChars;
        public uint dwFillAttribute;
        public uint dwFlags;
        public ushort wShowWindow;
        public ushort cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct STARTUPINFOEX
    {
        public STARTUPINFO StartupInfo;
        public IntPtr lpAttributeList;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateFile(
        string fileName,
        uint desiredAccess,
        uint shareMode,
        ref SECURITY_ATTRIBUTES securityAttributes,
        uint creationDisposition,
        uint flagsAndAttributes,
        IntPtr templateFile
    );

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr jobAttributes, string name);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcess(
        string applicationName,
        StringBuilder commandLine,
        IntPtr processAttributes,
        IntPtr threadAttributes,
        bool inheritHandles,
        uint creationFlags,
        IntPtr environment,
        string currentDirectory,
        ref STARTUPINFOEX startupInfo,
        out PROCESS_INFORMATION processInformation
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern void DeleteProcThreadAttributeList(IntPtr attributeList);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool DuplicateHandle(
        IntPtr sourceProcess,
        IntPtr sourceHandle,
        IntPtr targetProcess,
        out IntPtr targetHandle,
        uint desiredAccess,
        bool inheritHandle,
        uint options
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GetStdHandle(int standardHandle);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool InitializeProcThreadAttributeList(
        IntPtr attributeList,
        int attributeCount,
        uint flags,
        ref UIntPtr size
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint desiredAccess, bool inheritHandle, uint processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr job,
        int informationClass,
        IntPtr information,
        uint informationLength
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateJobObject(IntPtr job, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool UpdateProcThreadAttribute(
        IntPtr attributeList,
        uint flags,
        IntPtr attribute,
        IntPtr value,
        UIntPtr size,
        IntPtr previousValue,
        IntPtr returnSize
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForMultipleObjects(
        uint count,
        IntPtr[] handles,
        bool waitAll,
        uint milliseconds
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    public static void Prepare(
        string executable,
        string[] arguments,
        string currentDirectory,
        int launcherProcessId
    )
    {
        if (String.IsNullOrWhiteSpace(executable) || !Path.IsPathRooted(executable))
        {
            throw new ArgumentException("The target executable must use an absolute path.");
        }
        if (!File.Exists(executable))
        {
            throw new FileNotFoundException("The target executable does not exist.", executable);
        }
        string extension = Path.GetExtension(executable);
        if (String.Equals(extension, ".bat", StringComparison.OrdinalIgnoreCase) ||
            String.Equals(extension, ".cmd", StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("Command scripts cannot be assigned directly to the Job.");
        }
        if (!String.IsNullOrWhiteSpace(currentDirectory) && !Directory.Exists(currentDirectory))
        {
            throw new DirectoryNotFoundException("The target working directory does not exist.");
        }
        if (launcherProcessId <= 0)
        {
            throw new ArgumentOutOfRangeException("launcherProcessId");
        }

        try
        {
            launcherHandle = OpenProcess(PROCESS_SYNCHRONIZE, false, (uint)launcherProcessId);
            if (launcherHandle == IntPtr.Zero)
            {
                ThrowLastError("OpenProcess for launcher");
            }

            jobHandle = CreateJobObject(IntPtr.Zero, null);
            if (jobHandle == IntPtr.Zero)
            {
                ThrowLastError("CreateJobObject");
            }
            ConfigureKillOnClose(jobHandle);
            CreateSuspendedTarget(executable, arguments, currentDirectory);

            if (!AssignProcessToJobObject(jobHandle, targetProcessHandle))
            {
                ThrowLastError("AssignProcessToJobObject");
            }

            uint launcherState = WaitForSingleObject(launcherHandle, 0);
            if (launcherState == WAIT_OBJECT_0)
            {
                throw new InvalidOperationException("The Node launcher exited before ownership proof.");
            }
            if (launcherState == WAIT_FAILED)
            {
                ThrowLastError("WaitForSingleObject for launcher");
            }
            if (launcherState != WAIT_TIMEOUT)
            {
                throw new Win32Exception("Unexpected launcher wait result " + launcherState + ".");
            }
        }
        catch
        {
            Abort();
            throw;
        }
    }

    public static int RunPrepared()
    {
        if (jobHandle == IntPtr.Zero || launcherHandle == IntPtr.Zero ||
            targetProcessHandle == IntPtr.Zero || targetThreadHandle == IntPtr.Zero)
        {
            throw new InvalidOperationException("The Windows Job target is not prepared.");
        }

        try
        {
            if (ResumeThread(targetThreadHandle) == UInt32.MaxValue)
            {
                ThrowLastError("ResumeThread");
            }
            CloseHandle(targetThreadHandle);
            targetThreadHandle = IntPtr.Zero;

            IntPtr[] handles = new IntPtr[] { targetProcessHandle, launcherHandle };
            uint waitResult = WaitForMultipleObjects(2, handles, false, INFINITE);
            if (waitResult == WAIT_OBJECT_0 + 1)
            {
                throw new InvalidOperationException("The Node launcher exited before the target.");
            }
            if (waitResult == WAIT_FAILED)
            {
                ThrowLastError("WaitForMultipleObjects");
            }
            if (waitResult != WAIT_OBJECT_0)
            {
                throw new Win32Exception("Unexpected process wait result " + waitResult + ".");
            }

            uint exitCode;
            if (!GetExitCodeProcess(targetProcessHandle, out exitCode))
            {
                ThrowLastError("GetExitCodeProcess");
            }
            CloseHandle(targetProcessHandle);
            targetProcessHandle = IntPtr.Zero;
            return unchecked((int)exitCode);
        }
        catch
        {
            Abort();
            throw;
        }
    }

    public static void WaitForLauncherExit()
    {
        if (launcherHandle == IntPtr.Zero)
        {
            Abort();
            return;
        }
        uint waitResult = WaitForSingleObject(launcherHandle, INFINITE);
        if (waitResult == WAIT_FAILED)
        {
            int error = Marshal.GetLastWin32Error();
            Abort();
            throw new Win32Exception(error, "WaitForSingleObject for launcher failed");
        }
        Abort();
        if (waitResult != WAIT_OBJECT_0)
        {
            throw new Win32Exception("Unexpected launcher wait result " + waitResult + ".");
        }
    }

    public static void Abort()
    {
        if (jobHandle != IntPtr.Zero)
        {
            TerminateJobObject(jobHandle, 125);
        }
        if (targetProcessHandle != IntPtr.Zero)
        {
            TerminateProcess(targetProcessHandle, 125);
        }
        CloseTrackedHandle(ref targetThreadHandle);
        CloseTrackedHandle(ref targetProcessHandle);
        CloseTrackedHandle(ref launcherHandle);
        CloseTrackedHandle(ref jobHandle);
    }

    private static void CreateSuspendedTarget(
        string executable,
        string[] arguments,
        string currentDirectory
    )
    {
        IntPtr attributeList = IntPtr.Zero;
        IntPtr handleList = IntPtr.Zero;
        IntPtr standardInput = IntPtr.Zero;
        IntPtr standardOutput = IntPtr.Zero;
        IntPtr standardError = IntPtr.Zero;
        bool attributeListInitialized = false;
        PROCESS_INFORMATION processInformation = new PROCESS_INFORMATION();

        try
        {
            standardInput = CreateNullInputHandle();
            standardOutput = DuplicateInheritableHandle(GetRequiredStdHandle(STD_OUTPUT_HANDLE));
            standardError = DuplicateInheritableHandle(GetRequiredStdHandle(STD_ERROR_HANDLE));

            UIntPtr attributeListSize = UIntPtr.Zero;
            InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attributeListSize);
            if (attributeListSize == UIntPtr.Zero)
            {
                ThrowLastError("InitializeProcThreadAttributeList size query");
            }
            attributeList = Marshal.AllocHGlobal(checked((int)attributeListSize.ToUInt64()));
            if (!InitializeProcThreadAttributeList(attributeList, 1, 0, ref attributeListSize))
            {
                ThrowLastError("InitializeProcThreadAttributeList");
            }
            attributeListInitialized = true;

            IntPtr[] inheritedHandles = new IntPtr[] { standardInput, standardOutput, standardError };
            handleList = Marshal.AllocHGlobal(IntPtr.Size * inheritedHandles.Length);
            for (int index = 0; index < inheritedHandles.Length; index += 1)
            {
                Marshal.WriteIntPtr(handleList, index * IntPtr.Size, inheritedHandles[index]);
            }
            if (!UpdateProcThreadAttribute(
                attributeList,
                0,
                ProcThreadAttributeHandleList,
                handleList,
                new UIntPtr((uint)(IntPtr.Size * inheritedHandles.Length)),
                IntPtr.Zero,
                IntPtr.Zero
            ))
            {
                ThrowLastError("UpdateProcThreadAttribute for handle list");
            }

            STARTUPINFOEX startupInfo = new STARTUPINFOEX();
            startupInfo.StartupInfo.cb = (uint)Marshal.SizeOf(typeof(STARTUPINFOEX));
            startupInfo.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
            startupInfo.StartupInfo.hStdInput = standardInput;
            startupInfo.StartupInfo.hStdOutput = standardOutput;
            startupInfo.StartupInfo.hStdError = standardError;
            startupInfo.lpAttributeList = attributeList;

            string commandLineText = BuildCommandLine(executable, arguments);
            if (commandLineText.Length >= 32767)
            {
                throw new ArgumentException("The Windows target command line exceeds 32766 characters.");
            }
            StringBuilder commandLine = new StringBuilder(commandLineText);
            bool created = CreateProcess(
                executable,
                commandLine,
                IntPtr.Zero,
                IntPtr.Zero,
                true,
                CREATE_SUSPENDED | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT,
                IntPtr.Zero,
                String.IsNullOrWhiteSpace(currentDirectory) ? null : currentDirectory,
                ref startupInfo,
                out processInformation
            );
            if (!created)
            {
                ThrowLastError("CreateProcess");
            }
            targetProcessHandle = processInformation.hProcess;
            targetThreadHandle = processInformation.hThread;
        }
        finally
        {
            if (attributeListInitialized)
            {
                DeleteProcThreadAttributeList(attributeList);
            }
            if (attributeList != IntPtr.Zero) Marshal.FreeHGlobal(attributeList);
            if (handleList != IntPtr.Zero) Marshal.FreeHGlobal(handleList);
            CloseLocalHandle(standardInput);
            CloseLocalHandle(standardOutput);
            CloseLocalHandle(standardError);
        }
    }

    private static IntPtr CreateNullInputHandle()
    {
        SECURITY_ATTRIBUTES attributes = new SECURITY_ATTRIBUTES();
        attributes.nLength = (uint)Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
        attributes.bInheritHandle = true;
        IntPtr handle = CreateFile(
            "NUL",
            GENERIC_READ,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            ref attributes,
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            IntPtr.Zero
        );
        if (handle == InvalidHandleValue)
        {
            ThrowLastError("CreateFile for NUL");
        }
        return handle;
    }

    private static IntPtr DuplicateInheritableHandle(IntPtr sourceHandle)
    {
        IntPtr currentProcess = GetCurrentProcess();
        IntPtr duplicate;
        if (!DuplicateHandle(
            currentProcess,
            sourceHandle,
            currentProcess,
            out duplicate,
            0,
            true,
            DUPLICATE_SAME_ACCESS
        ))
        {
            ThrowLastError("DuplicateHandle");
        }
        return duplicate;
    }

    private static IntPtr GetRequiredStdHandle(int standardHandle)
    {
        IntPtr handle = GetStdHandle(standardHandle);
        if (handle == IntPtr.Zero || handle == InvalidHandleValue)
        {
            ThrowLastError("GetStdHandle");
        }
        return handle;
    }

    private static void ConfigureKillOnClose(IntPtr job)
    {
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits =
            new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        int size = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
        IntPtr buffer = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(limits, buffer, false);
            if (!SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                buffer,
                (uint)size
            ))
            {
                ThrowLastError("SetInformationJobObject");
            }
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static string BuildCommandLine(string executable, string[] arguments)
    {
        StringBuilder commandLine = new StringBuilder(QuoteArgument(executable));
        foreach (string argument in arguments ?? new string[0])
        {
            commandLine.Append(' ');
            commandLine.Append(QuoteArgument(argument ?? String.Empty));
        }
        return commandLine.ToString();
    }

    private static string QuoteArgument(string value)
    {
        if (String.IsNullOrEmpty(value)) return "\"\"";

        bool requiresQuotes = false;
        foreach (char character in value)
        {
            if (Char.IsWhiteSpace(character) || character == '"')
            {
                requiresQuotes = true;
                break;
            }
        }
        if (!requiresQuotes) return value;

        StringBuilder quoted = new StringBuilder("\"");
        int backslashes = 0;
        foreach (char character in value)
        {
            if (character == '\\')
            {
                backslashes += 1;
                continue;
            }
            if (character == '"')
            {
                quoted.Append('\\', backslashes * 2 + 1);
                quoted.Append('"');
                backslashes = 0;
                continue;
            }
            quoted.Append('\\', backslashes);
            backslashes = 0;
            quoted.Append(character);
        }
        quoted.Append('\\', backslashes * 2);
        quoted.Append('"');
        return quoted.ToString();
    }

    private static void CloseTrackedHandle(ref IntPtr handle)
    {
        if (handle == IntPtr.Zero) return;
        CloseHandle(handle);
        handle = IntPtr.Zero;
    }

    private static void CloseLocalHandle(IntPtr handle)
    {
        if (handle != IntPtr.Zero && handle != InvalidHandleValue) CloseHandle(handle);
    }

    private static void ThrowLastError(string operation)
    {
        throw new Win32Exception(Marshal.GetLastWin32Error(), operation + " failed");
    }
}
'@

function Read-BoundedInput {
    param(
        [System.IO.TextReader]$Reader,
        [int]$Limit
    )

    $builder = [System.Text.StringBuilder]::new()
    $buffer = [char[]]::new(4096)
    while (($count = $Reader.Read($buffer, 0, $buffer.Length)) -gt 0) {
        if ($builder.Length + $count -gt $Limit) {
            throw "The Windows Job configuration exceeded $Limit characters."
        }
        [void]$builder.Append($buffer, 0, $count)
    }
    return $builder.ToString()
}

function Read-BoundedLine {
    param(
        [System.IO.TextReader]$Reader,
        [int]$Limit
    )

    $builder = [System.Text.StringBuilder]::new()
    while ($true) {
        $value = $Reader.Read()
        if ($value -eq -1) {
            throw 'The Node launcher closed the Job control pipe.'
        }
        $character = [char]$value
        if ($character -eq "`n") {
            return $builder.ToString().TrimEnd("`r")
        }
        if ($builder.Length -ge $Limit) {
            throw "The Job control frame exceeded $Limit characters."
        }
        [void]$builder.Append($character)
    }
}

function Write-Frame {
    param(
        [System.IO.StreamWriter]$Writer,
        [hashtable]$Frame
    )

    $Writer.WriteLine(($Frame | ConvertTo-Json -Compress))
    $Writer.Flush()
}

$pipe = $null
$inputStream = $null
$inputReader = $null
$reader = $null
$writer = $null
$reportedTargetResult = $false

try {
    $inputEncoding = [System.Text.UTF8Encoding]::new($false, $true)
    $inputStream = [Console]::OpenStandardInput()
    $inputReader = [System.IO.StreamReader]::new($inputStream, $inputEncoding, $false, 1024, $true)
    $configurationText = Read-BoundedInput -Reader $inputReader -Limit 262144
    $configuration = $configurationText | ConvertFrom-Json
    $expectedProperties = @('args', 'command', 'cwd', 'launcherPid', 'nonce', 'pipeName')
    $actualProperties = @($configuration.PSObject.Properties.Name | Sort-Object)
    if (@(Compare-Object $expectedProperties $actualProperties).Count -ne 0) {
        throw 'The Windows Job configuration fields are invalid.'
    }
    if (-not $configuration.command) {
        throw 'The Windows Job target command is missing.'
    }
    if ([int]$configuration.launcherPid -le 0) {
        throw 'The Node launcher PID is invalid.'
    }
    if ([string]$configuration.nonce -notmatch '^[0-9a-f]{64}$') {
        throw 'The Windows Job nonce is invalid.'
    }
    if ([string]$configuration.pipeName -notmatch '^audiobash-job-[0-9]+-[0-9a-f]{64}$') {
        throw 'The Windows Job pipe name is invalid.'
    }

    $pipe = [System.IO.Pipes.NamedPipeClientStream]::new(
        '.',
        [string]$configuration.pipeName,
        [System.IO.Pipes.PipeDirection]::InOut
    )
    $pipe.Connect(5000)
    $encoding = [System.Text.UTF8Encoding]::new($false, $true)
    $reader = [System.IO.StreamReader]::new($pipe, $encoding, $false, 1024, $true)
    $writer = [System.IO.StreamWriter]::new($pipe, $encoding, 1024, $true)
    $writer.AutoFlush = $true

    Add-Type -TypeDefinition $nativeSource -Language CSharp
    $arguments = @($configuration.args | ForEach-Object { [string]$_ })
    [AudioBashJobOwner]::Prepare(
        [string]$configuration.command,
        $arguments,
        [string]$configuration.cwd,
        [int]$configuration.launcherPid
    )

    Write-Frame -Writer $writer -Frame @{
        type = 'owner-ready'
        nonce = [string]$configuration.nonce
        ownerPid = $PID
    }
    if ((Read-BoundedLine -Reader $reader -Limit 16) -ne 'start') {
        throw 'The Node launcher returned an invalid start acknowledgment.'
    }

    $exitCode = [AudioBashJobOwner]::RunPrepared()
    Write-Frame -Writer $writer -Frame @{
        type = 'target-result'
        nonce = [string]$configuration.nonce
        code = $exitCode
        signal = $null
    }
    $reportedTargetResult = $true

    $writer.Dispose()
    $writer = $null
    $reader.Dispose()
    $reader = $null
    $pipe.Dispose()
    $pipe = $null
    [AudioBashJobOwner]::WaitForLauncherExit()
} catch {
    if ('AudioBashJobOwner' -as [type]) {
        [AudioBashJobOwner]::Abort()
    }
    $message = [string]$_.Exception.Message
    if ($message.Length -gt 512) {
        $message = $message.Substring(0, 512)
    }
    if ($writer -and -not $reportedTargetResult) {
        try {
            Write-Frame -Writer $writer -Frame @{
                type = 'startup-error'
                nonce = [string]$configuration.nonce
                message = $message
            }
        } catch {
            # The launcher may already be gone.
        }
    }
    [Console]::Error.WriteLine($message)
    exit 125
} finally {
    if ($writer) { $writer.Dispose() }
    if ($reader) { $reader.Dispose() }
    if ($pipe) { $pipe.Dispose() }
    if ($inputReader) { $inputReader.Dispose() }
    if ($inputStream) { $inputStream.Dispose() }
}

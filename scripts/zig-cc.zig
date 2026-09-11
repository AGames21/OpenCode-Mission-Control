// zig-cc shim: lets Rust build scripts + linking work without MSVC.
// Compile: zig build-exe scripts/zig-cc.zig -OReleaseSmall
const std = @import("std");

const ZIG_EXE = "C:\\Users\\speci\\AppData\\Local\\Microsoft\\WinGet\\Packages\\zig.zig_Microsoft.Winget.Source_8wekyb3d8bbwe\\zig-x86_64-windows-0.16.0\\zig.exe";

pub fn main() void {
    const alloc = std.heap.page_allocator;
    var argv: [1024][]const u8 = undefined;
    argv[0] = ZIG_EXE;
    argv[1] = "cc";
    argv[2] = "-target";
    argv[3] = "x86_64-windows-msvc";
    argv[4] = "-fno-sanitize=all";
    var n: usize = 5;
    for (std.os.argv[1..]) |a| {
        if (n >= argv.len) break;
        argv[n] = std.mem.span(a);
        n += 1;
    }
    var child = std.process.Child.init(argv[0..n], alloc);
    const term = child.spawnAndWait() catch std.process.exit(1);
    switch (term) {
        .Exited => |code| std.process.exit(code),
        else => std.process.exit(1),
    }
}

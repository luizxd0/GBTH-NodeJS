import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

public class decompile_mobile_helpers extends GhidraScript {
    @Override
    public void run() throws Exception {
        String[] addrs = new String[] {
            "0045a0a0",
            "00459de0",
            "00459be0",
            "0046e700",
            "00453780",
            "00435800",
            "004378c0",
            "00461250"
        };

        DecompInterface ifc = new DecompInterface();
        ifc.openProgram(currentProgram);

        for (String a : addrs) {
            Address addr = toAddr(a);
            Function f = getFunctionAt(addr);
            if (f == null) f = getFunctionContaining(addr);
            println("=== Function @ " + a + " => " + (f == null ? "<none>" : f.getName() + " " + f.getEntryPoint()) + " ===");
            if (f == null) continue;
            DecompileResults res = ifc.decompileFunction(f, 120, monitor);
            if (res != null && res.decompileCompleted()) {
                println(res.getDecompiledFunction().getC());
            } else {
                println("Decompile failed");
            }
        }
    }
}

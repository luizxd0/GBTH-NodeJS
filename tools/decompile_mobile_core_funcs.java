import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

public class decompile_mobile_core_funcs extends GhidraScript {
    @Override
    public void run() throws Exception {
        String[] addrs = new String[] {
            "0045cd40", // likely per-mobile init values
            "00463630", // common update/draw
            "00461250", // helper used by tank15-related
            "00435800", // render helper
            "0045eac0"  // geometry helper
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
                println("Decompile failed for " + f.getName());
            }
        }
    }
}

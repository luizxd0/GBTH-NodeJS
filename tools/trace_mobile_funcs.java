import java.util.LinkedHashSet;
import java.util.Set;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;

public class trace_mobile_funcs extends GhidraScript {
    private final Set<String> printed = new LinkedHashSet<>();

    @Override
    public void run() throws Exception {
        DecompInterface ifc = new DecompInterface();
        ifc.openProgram(currentProgram);

        analyzeStringRef(ifc, "0055e2b8", "rider");
        analyzeStringRef(ifc, "0055e2c0", "tank_%d");
    }

    private void analyzeStringRef(DecompInterface ifc, String addrStr, String label) throws Exception {
        Address addr = toAddr(addrStr);
        println("=== References to " + label + " @ " + addr + " ===");
        Reference[] refs = getReferencesTo(addr);
        Set<Function> funcs = new LinkedHashSet<>();
        for (Reference ref : refs) {
            Function f = getFunctionContaining(ref.getFromAddress());
            if (f != null) funcs.add(f);
            println("ref from " + ref.getFromAddress() + " in " + (f == null ? "<none>" : f.getName()));
        }

        for (Function f : funcs) {
            printFunctionWithCallers(ifc, f, 1);
        }
    }

    private void printFunctionWithCallers(DecompInterface ifc, Function f, int callerDepth) throws Exception {
        if (f == null) return;
        String key = f.getEntryPoint().toString();
        if (!printed.add(key)) return;
        decompileAndPrint(ifc, f);

        if (callerDepth <= 0) return;
        Reference[] refs = getReferencesTo(f.getEntryPoint());
        for (Reference ref : refs) {
            Function caller = getFunctionContaining(ref.getFromAddress());
            if (caller != null) {
                printFunctionWithCallers(ifc, caller, callerDepth - 1);
            }
        }
    }

    private void decompileAndPrint(DecompInterface ifc, Function f) throws Exception {
        println("=== Function " + f.getName() + " @ " + f.getEntryPoint() + " ===");
        DecompileResults res = ifc.decompileFunction(f, 60, monitor);
        if (res != null && res.decompileCompleted()) {
            println(res.getDecompiledFunction().getC());
            return;
        }
        println("Decompile failed for " + f.getName());
    }
}

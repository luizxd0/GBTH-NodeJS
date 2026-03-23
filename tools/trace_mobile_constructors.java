import java.util.LinkedHashMap;
import java.util.Map;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

public class trace_mobile_constructors extends GhidraScript {
    @Override
    public void run() throws Exception {
        Map<String, String> mobileToVtable = new LinkedHashMap<>();
        mobileToVtable.put("tank1", "00560990");
        mobileToVtable.put("tank2", "00560a70");
        mobileToVtable.put("tank3", "00561014");
        mobileToVtable.put("tank4", "005609cc");
        mobileToVtable.put("tank5", "0055fee4");
        mobileToVtable.put("tank6", "00560d6c");
        mobileToVtable.put("tank7", "005608c4");
        mobileToVtable.put("tank8", "0056027c");
        mobileToVtable.put("tank9", "005607ac");
        mobileToVtable.put("tank10", "00560504");
        mobileToVtable.put("tank11", "00560fa8");
        mobileToVtable.put("tank12", "00560494");
        mobileToVtable.put("tank13", "00560f38");
        mobileToVtable.put("tank14", "005605f0");
        mobileToVtable.put("tank15", "005602a0");
        mobileToVtable.put("tank16", "0055fd7c");

        DecompInterface ifc = new DecompInterface();
        ifc.openProgram(currentProgram);

        decompileByAddress(ifc, "00463630", "common mobile update/draw");
        decompileByAddress(ifc, "0045a160", "common mobile ctor/base init");
        decompileByAddress(ifc, "0045eac0", "common geometry helper");

        for (Map.Entry<String, String> entry : mobileToVtable.entrySet()) {
            String mobile = entry.getKey();
            Address vtableAddr = toAddr(entry.getValue());
            int ctorRaw = getInt(vtableAddr); // slot 0
            long ctorPtr = Integer.toUnsignedLong(ctorRaw);
            Address ctorAddr = toAddr(ctorPtr);
            println("=== " + mobile + " ctor slot0 @ " + ctorAddr + " (vtable " + vtableAddr + ") ===");
            decompileByAddress(ifc, ctorAddr.toString(), mobile + " ctor");
        }
    }

    private void decompileByAddress(DecompInterface ifc, String addrStr, String label) throws Exception {
        Address addr = toAddr(addrStr);
        Function f = getFunctionAt(addr);
        if (f == null) {
            f = getFunctionContaining(addr);
        }
        println("=== " + label + " @ " + addr + " => " + (f == null ? "<none>" : f.getName()) + " ===");
        if (f == null) return;
        DecompileResults res = ifc.decompileFunction(f, 90, monitor);
        if (res != null && res.decompileCompleted()) {
            println(res.getDecompiledFunction().getC());
        } else {
            println("Decompile failed for " + f.getName());
        }
    }
}

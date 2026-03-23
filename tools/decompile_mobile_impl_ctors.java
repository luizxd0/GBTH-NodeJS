import java.util.LinkedHashMap;
import java.util.Map;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

public class decompile_mobile_impl_ctors extends GhidraScript {
    @Override
    public void run() throws Exception {
        Map<String, String> funcs = new LinkedHashMap<>();
        funcs.put("tank1_impl_ctor", "004816b0");
        funcs.put("tank2_impl_ctor", "00484ba0");
        funcs.put("tank3_impl_ctor", "004a0800");
        funcs.put("tank4_impl_ctor", "00481fd0");
        funcs.put("tank5_impl_ctor", "00456e10");
        funcs.put("tank6_impl_ctor", "00490870");
        funcs.put("tank7_impl_ctor", "0047eed0");
        funcs.put("tank8_impl_ctor", "00467d70");
        funcs.put("tank9_impl_ctor", "0047ab90");
        funcs.put("tank10_impl_ctor", "004730a0");
        funcs.put("tank11_impl_ctor", "0049d4e0");
        funcs.put("tank12_impl_ctor", "00470240");
        funcs.put("tank14_impl_ctor", "00476e50");
        funcs.put("tank16_impl_ctor", "00451b70");
        funcs.put("tank15_related", "00468340");
        funcs.put("tank13_related", "0049b8e0");
        funcs.put("common_base_ctor", "0045a160");
        funcs.put("common_update_draw", "00463630");

        DecompInterface ifc = new DecompInterface();
        ifc.openProgram(currentProgram);

        for (Map.Entry<String, String> entry : funcs.entrySet()) {
            String name = entry.getKey();
            Address addr = toAddr(entry.getValue());
            Function f = getFunctionAt(addr);
            if (f == null) f = getFunctionContaining(addr);
            println("=== " + name + " @ " + addr + " => " + (f == null ? "<none>" : f.getName()) + " ===");
            if (f == null) continue;
            DecompileResults res = ifc.decompileFunction(f, 90, monitor);
            if (res != null && res.decompileCompleted()) {
                println(res.getDecompiledFunction().getC());
            } else {
                println("Decompile failed for " + f.getName());
            }
        }
    }
}
